/**
 * drain-webhooks — process queued Stripe/Hostaway events (spec §11.3, §21.2).
 * The receiving route already tries once right after responding; this job is
 * the retry path for anything still 'received' or 'failed' (attempts < 5).
 * Each event is claimed with a conditional update so two invocations never
 * process the same row.
 */
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import { processStripeEvent } from "@/lib/stripe/webhooks";
import { log } from "@/lib/observability/logger";
import type { JobFn } from "./registry";

const MAX_ATTEMPTS = 5;

/** Claim and process one persisted event. Shared with the receiving route. Never throws. */
export async function processWebhookEvent(
  id: string,
  requestId: string,
): Promise<"processed" | "skipped" | "failed" | "busy"> {
  const db = adminDb();
  const { data: claimed } = await db
    .from("webhook_events")
    .update({ state: "processing" })
    .eq("id", id)
    .in("state", ["received", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
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
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", id);
    return outcome;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
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

export const drainWebhooks: JobFn = async ({ requestId }) => {
  const { data: due, error } = await adminDb()
    .from("webhook_events")
    .select("id")
    .in("state", ["received", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("received_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`webhook_events read failed: ${error.message}`);

  const tally = { processed: 0, skipped: 0, failed: 0, busy: 0 };
  for (const row of due ?? []) tally[await processWebhookEvent(row.id, requestId)]++;
  return {
    examined: due?.length ?? 0,
    changed: tally.processed,
    notes: `processed=${tally.processed} skipped=${tally.skipped} failed=${tally.failed} busy=${tally.busy}`,
  };
};
