/**
 * drain-webhooks — process queued Stripe/Hostaway events (spec §11.3, §21.2, §17.2, §17.3).
 *
 * The receiving route already tries once right after responding; this job (every
 * minute) is the retry path for anything still 'received' or 'failed'. Each event
 * is claimed with a conditional update so two invocations never process the same row.
 *
 *   • An event whose booking is not committed locally yet (OrphanEvent) is parked:
 *     retried at 1, 2, 4, 8 minutes, and after 15 minutes it fails with an alert.
 *   • The same minute cadence also resumes any approved booking whose confirmation
 *     did not finish (Hostaway transient failure, crash between steps). Ops are
 *     alerted once when a booking has been approved and paid but has no reservation
 *     after `confirm.unresolved_alert_minutes` (default 5) — §17.3 "write times out".
 */
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import { confirmBooking } from "@/lib/payments/confirm";
import { OrphanEvent, processStripeEvent } from "@/lib/stripe/webhooks";
import { alertCritical, slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import type { JobFn } from "./registry";

const MAX_ATTEMPTS = 8;
export const ORPHAN_PARK_MAX_MS = 15 * 60_000;
export const PARK_BACKOFF_MS = [60_000, 120_000, 240_000, 480_000];

export function parkDelayMs(attempt: number): number {
  return PARK_BACKOFF_MS[Math.min(attempt, PARK_BACKOFF_MS.length - 1)];
}

/** Claim and process one persisted event. Shared with the receiving route. Never throws. */
export async function processWebhookEvent(
  id: string,
  requestId: string,
): Promise<"processed" | "skipped" | "failed" | "busy" | "parked"> {
  const db = adminDb();
  const nowIso = new Date().toISOString();
  const { data: claimed } = await db
    .from("webhook_events")
    .update({ state: "processing" })
    .eq("id", id)
    .in("state", ["received", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .select("*")
    .maybeSingle();
  if (!claimed) return "busy";

  try {
    let outcome: "processed" | "skipped" = "skipped";
    if (claimed.source === "stripe") {
      outcome = await processStripeEvent(claimed.payload as unknown as Stripe.Event, requestId);
    }
    await db
      .from("webhook_events")
      .update({
        state: outcome,
        attempts: claimed.attempts + 1,
        processed_at: nowIso,
        last_error: null,
        next_attempt_at: null,
        parked_reason: null,
      })
      .eq("id", id);
    return outcome;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof OrphanEvent) {
      const age = Date.now() - Date.parse(claimed.received_at);
      if (age < ORPHAN_PARK_MAX_MS) {
        const next = new Date(Date.now() + parkDelayMs(claimed.attempts)).toISOString();
        await db
          .from("webhook_events")
          .update({ state: "received", attempts: claimed.attempts + 1, next_attempt_at: next, parked_reason: e.what })
          .eq("id", id);
        log.info("webhook.parked", { requestId, id, type: claimed.event_type, what: e.what, next });
        return "parked";
      }
      await db
        .from("webhook_events")
        .update({ state: "failed", attempts: MAX_ATTEMPTS, last_error: message.slice(0, 1000), parked_reason: e.what })
        .eq("id", id);
      await alertCritical("Stripe event never matched a local record", {
        eventId: claimed.external_id,
        type: claimed.event_type,
        what: e.what,
        receivedAt: claimed.received_at,
        requestId,
      });
      return "failed";
    }
    await db
      .from("webhook_events")
      .update({ state: "failed", attempts: claimed.attempts + 1, last_error: message.slice(0, 1000) })
      .eq("id", id);
    log.error("webhook.process_failed", {
      requestId,
      id,
      type: claimed.event_type,
      attempt: claimed.attempts + 1,
      error: message,
    });
    return "failed";
  }
}

/** Resume approved bookings whose confirmation is incomplete; alert ops once past the window. */
export async function resumeConfirmations(requestId: string, now = new Date()) {
  const db = adminDb();
  const { data: setting } = await db
    .from("settings")
    .select("value")
    .eq("key", "confirm.unresolved_alert_minutes")
    .maybeSingle();
  const alertAfterMs = (Number(setting?.value ?? 5) || 5) * 60_000;
  const { data: open, error } = await db
    .from("booking_requests")
    .select("*")
    .eq("status", "APPROVED")
    .lt("approved_at", new Date(now.getTime() - 60_000).toISOString())
    .limit(50);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);

  let resumed = 0;
  let alerted = 0;
  for (const b of open ?? []) {
    try {
      const out = await confirmBooking(b.id, requestId, "job");
      if (out.status === "CONFIRMED") resumed++;
      const unresolved = out.status === "APPROVED" && !b.hostaway_reservation_id;
      const age = now.getTime() - Date.parse(b.approved_at ?? b.updated_at);
      if (unresolved && age >= alertAfterMs && !b.confirm_alerted_at) {
        const { data: claimed } = await db
          .from("booking_requests")
          .update({ confirm_alerted_at: now.toISOString() })
          .eq("id", b.id)
          .is("confirm_alerted_at", null)
          .select("id");
        if (claimed?.length) {
          alerted++;
          await alertCritical("Approved booking still has no Hostaway reservation", {
            reference: b.reference,
            approvedAt: b.approved_at,
            attempts: b.hostaway_write_attempts,
            lastError: b.hostaway_last_error,
            note: out.note,
            requestId,
          });
        }
      }
    } catch (e) {
      log.error("confirm.resume_failed", { requestId, reference: b.reference, error: String(e) });
    }
  }
  return { examined: open?.length ?? 0, resumed, alerted };
}

export const drainWebhooks: JobFn = async ({ requestId }) => {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await adminDb()
    .from("webhook_events")
    .select("id")
    .in("state", ["received", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("received_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`webhook_events read failed: ${error.message}`);

  const tally = { processed: 0, skipped: 0, failed: 0, busy: 0, parked: 0 };
  for (const row of due ?? []) tally[await processWebhookEvent(row.id, requestId)]++;

  const confirms = await resumeConfirmations(requestId);
  if (confirms.resumed)
    await slack(
      "bookings",
      `:arrows_counterclockwise: drain-webhooks completed ${confirms.resumed} pending confirmation(s).`,
    );

  return {
    examined: (due?.length ?? 0) + confirms.examined,
    changed: tally.processed + confirms.resumed,
    notes: `processed=${tally.processed} parked=${tally.parked} skipped=${tally.skipped} failed=${tally.failed} busy=${tally.busy} confirmsResumed=${confirms.resumed} confirmsAlerted=${confirms.alerted}`,
  };
};
