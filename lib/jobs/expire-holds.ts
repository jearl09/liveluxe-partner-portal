/**
 * expire-holds — release lapsed soft holds (spec §7.2, §10.1 EXPIRED, §21.2).
 * Runs as the system actor through the service role: the SQL function sees no
 * auth.uid() and records actor_type = 'system'. Each request is its own
 * transaction; one failure does not stop the sweep. PaymentIntent cancellation
 * joins in week 3 with Stripe.
 */
import { adminDb } from "@/lib/db/admin";
import { assertTransition, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { log } from "@/lib/observability/logger";
import type { JobFn } from "./registry";

const EXPIRABLE: readonly BookingStatus[] = ["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED"];

export const expireHolds: JobFn = async ({ requestId }) => {
  const db = adminDb();
  const nowIso = new Date().toISOString();
  const { data: due, error } = await db
    .from("booking_requests")
    .select("id, reference, status, hold_expires_at")
    .in("status", [...EXPIRABLE])
    .lt("hold_expires_at", nowIso)
    .limit(200);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);

  let expired = 0;
  let failed = 0;
  for (const b of due ?? []) {
    try {
      assertTransition(b.status, "EXPIRED", "system");
      const { error: tErr } = await db.rpc("apply_booking_transition", {
        p_booking_id: b.id,
        p_expected_from: b.status,
        p_to: "EXPIRED",
        p_reason: "hold expired",
      });
      if (tErr) throw new Error(tErr.message);
      expired++;
    } catch (e) {
      failed++;
      log.error("expire_holds.failed", {
        requestId,
        reference: b.reference,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Orphaned hold rows (no booking, or booking already terminal) that have lapsed.
  const { data: orphans } = await db.from("inventory_holds").delete().lt("expires_at", nowIso).select("id");

  return {
    examined: due?.length ?? 0,
    changed: expired,
    notes: `expired=${expired} failed=${failed} stale_holds_removed=${orphans?.length ?? 0}`,
  };
};
