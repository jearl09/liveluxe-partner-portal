/**
 * check-authorisations — spec §11.4, §17.2.
 *
 * 1. Card networks release an uncaptured authorisation after about 7 days. Flag
 *    every hold older than 5 days that is still waiting on a decision so ops
 *    decide (approve/decline) before the partner sees the pending charge vanish.
 * 2. "3DS challenge abandoned mid-flow": a card step left incomplete for longer
 *    than `payment.resume_reminder_minutes` earns one resume-link email. Also
 *    covers a declined card nobody retried and a Stripe outage that interrupted
 *    the flow ("we'll email you to complete payment").
 */
import { adminDb } from "@/lib/db/admin";
import { isAuthorisationStale, needsResumeReminder, paymentStateFromStripe } from "@/lib/domain/payments";
import { sendResumePayment } from "@/lib/payments/notify";
import { slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import type { JobFn } from "./registry";

const OPEN_REQUEST = ["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED", "APPROVED", "AWAITING_PAYMENT"];

export async function sendResumeReminders(requestId: string, now = new Date()): Promise<number> {
  const db = adminDb();
  const { data: setting } = await db
    .from("settings")
    .select("value")
    .eq("key", "payment.resume_reminder_minutes")
    .maybeSingle();
  const minutes = Number(setting?.value ?? 60) || 60;
  const { data: incomplete } = await db
    .from("payments")
    .select("*")
    .in("status", ["requires_action", "requires_payment_method", "requires_confirmation"])
    .is("reminder_sent_at", null)
    .lt("updated_at", new Date(now.getTime() - minutes * 60_000).toISOString())
    .limit(200);
  if (!incomplete?.length) return 0;

  const { data: bookings } = await db
    .from("booking_requests")
    .select("*")
    .in(
      "id",
      incomplete.map((p) => p.booking_id),
    );
  const listingIds = [...new Set((bookings ?? []).map((b) => b.listing_id))];
  const { data: listings } = listingIds.length
    ? await db.from("listings").select("id, public_name").in("id", listingIds)
    : { data: [] as { id: string; public_name: string }[] };
  const nameOf = new Map((listings ?? []).map((l) => [l.id, l.public_name]));

  let sent = 0;
  for (const p of incomplete) {
    const b = (bookings ?? []).find((x) => x.id === p.booking_id);
    if (!b || !OPEN_REQUEST.includes(b.status)) continue;
    const state = paymentStateFromStripe(p.status, p.failure_code);
    if (
      !needsResumeReminder({
        state,
        updatedAtIso: p.updated_at,
        reminderSentAtIso: p.reminder_sent_at,
        now,
        reminderMinutes: minutes,
      })
    )
      continue;
    const { data: claimed } = await db
      .from("payments")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("id", p.id)
      .is("reminder_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;
    await sendResumePayment(b, nameOf.get(b.listing_id) ?? "the property", p.stripe_payment_intent_id, requestId);
    sent++;
  }
  if (sent) log.info("payments.resume_reminders", { requestId, sent });
  return sent;
}

export const checkAuthorisations: JobFn = async ({ requestId }) => {
  const db = adminDb();
  const { data: holds, error } = await db
    .from("payments")
    .select("booking_id, authorised_at, stripe_payment_intent_id")
    .eq("status", "requires_capture")
    .not("authorised_at", "is", null)
    .limit(500);
  if (error) throw new Error(`payments read failed: ${error.message}`);

  const now = new Date();
  const stale = (holds ?? []).filter((h) => isAuthorisationStale(h.authorised_at!, now));
  let open: { id: string; reference: string; status: string }[] = [];
  if (stale.length) {
    const { data: bookings } = await db
      .from("booking_requests")
      .select("id, reference, status")
      .in(
        "id",
        stale.map((h) => h.booking_id),
      );
    open = (bookings ?? []).filter((b) =>
      ["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED", "APPROVED"].includes(b.status),
    );
    if (open.length) {
      const lines = open.map((b) => `• ${b.reference} (${b.status})`).join("\n");
      await slack(
        "alerts",
        `:hourglass: ${open.length} card hold(s) older than 5 days need a decision before they expire:\n${lines}`,
      );
      log.warn("payments.stale_authorisations", {
        requestId,
        count: open.length,
        references: open.map((b) => b.reference),
      });
    }
  }

  const reminders = await sendResumeReminders(requestId, now);
  return {
    examined: holds?.length ?? 0,
    changed: open.length + reminders,
    notes: `stale=${open.length} resumeReminders=${reminders}`,
  };
};
