/**
 * check-authorisations — spec §11.4. Card networks release an uncaptured
 * authorisation after about 7 days. Flag every hold older than 5 days that is
 * still waiting on a decision so ops decide (approve/decline) before the partner
 * sees the pending charge vanish and assumes the booking is cancelled.
 */
import { adminDb } from "@/lib/db/admin";
import { isAuthorisationStale } from "@/lib/domain/payments";
import { slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import type { JobFn } from "./registry";

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
  if (!stale.length) return { examined: holds?.length ?? 0, changed: 0 };

  const { data: bookings } = await db
    .from("booking_requests")
    .select("id, reference, status")
    .in(
      "id",
      stale.map((h) => h.booking_id),
    );
  const open = (bookings ?? []).filter((b) =>
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
  return { examined: holds?.length ?? 0, changed: open.length, notes: `stale=${open.length}` };
};
