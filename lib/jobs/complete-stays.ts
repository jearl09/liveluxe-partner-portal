/**
 * complete-stays — spec §10.6 "Completion", Appendix B (CONFIRMED→CHECKED_IN,
 * CHECKED_IN→COMPLETED), §21.2. Daily, property-local dates:
 *   arrival date reached   → CHECKED_IN (the access pack was released earlier)
 *   departure passed       → COMPLETED, feedback prompt, credential purge scheduled
 *   purge date passed      → the pack is no longer readable (credentials_purged_at)
 */
import { adminDb } from "@/lib/db/admin";
import { assertTransition } from "@/lib/domain/booking-state-machine";
import { todayIn } from "@/lib/domain/dates";
import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";
import type { JobFn } from "./registry";

export const completeStays: JobFn = async ({ requestId }) => {
  const db = adminDb();
  const now = new Date();
  const { data: setting } = await db
    .from("settings")
    .select("value")
    .eq("key", "checkin.purge_after_days")
    .maybeSingle();
  const purgeDays = Number(setting?.value ?? 7) || 7;

  const { data: live, error } = await db
    .from("booking_requests")
    .select("id, reference, status, listing_id, check_in, check_out, created_by")
    .in("status", ["CONFIRMED", "CHECKED_IN"])
    .lte("check_in", now.toISOString().slice(0, 10))
    .limit(500);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  const listingIds = [...new Set((live ?? []).map((b) => b.listing_id))];
  const { data: listings } = listingIds.length
    ? await db.from("listings").select("id, timezone").in("id", listingIds)
    : { data: [] as { id: string; timezone: string }[] };
  const tz = new Map((listings ?? []).map((l) => [l.id, l.timezone]));

  let checkedIn = 0;
  let completed = 0;
  let failed = 0;
  for (const b of live ?? []) {
    const today = todayIn(tz.get(b.listing_id) ?? "Australia/Melbourne", now);
    try {
      if (b.status === "CONFIRMED" && b.check_in <= today) {
        assertTransition("CONFIRMED", "CHECKED_IN", "system");
        const { error: tErr } = await db.rpc("apply_booking_transition", {
          p_booking_id: b.id,
          p_expected_from: "CONFIRMED",
          p_to: "CHECKED_IN",
          p_reason: "arrival date reached",
        });
        if (tErr) throw new Error(tErr.message);
        await db.from("booking_requests").update({ checked_in_at: now.toISOString() }).eq("id", b.id);
        checkedIn++;
        b.status = "CHECKED_IN";
      }
      if (b.status === "CHECKED_IN" && b.check_out <= today) {
        assertTransition("CHECKED_IN", "COMPLETED", "system");
        const { error: tErr } = await db.rpc("apply_booking_transition", {
          p_booking_id: b.id,
          p_expected_from: "CHECKED_IN",
          p_to: "COMPLETED",
          p_reason: "departure passed",
        });
        if (tErr) throw new Error(tErr.message);
        await db
          .from("booking_requests")
          .update({
            completed_at: now.toISOString(),
            credentials_purge_at: new Date(now.getTime() + purgeDays * 86_400_000).toISOString(),
          })
          .eq("id", b.id);
        await db.from("notifications").insert({
          user_id: b.created_by,
          type: "feedback_prompt",
          payload: {
            requestId: b.id,
            reference: b.reference,
            url: `${env().NEXT_PUBLIC_APP_URL}/requests/${b.id}`,
          } as never,
        });
        completed++;
      }
    } catch (e) {
      failed++;
      log.error("complete_stays.failed", { requestId, reference: b.reference, error: String(e) });
    }
  }

  const { data: purged } = await db
    .from("booking_requests")
    .update({ credentials_purged_at: now.toISOString() })
    .eq("status", "COMPLETED")
    .is("credentials_purged_at", null)
    .lte("credentials_purge_at", now.toISOString())
    .select("id");
  if (purged?.length)
    await db.from("audit_log").insert(
      purged.map((p) => ({
        actor_type: "system",
        action: "booking.credentials_purged",
        entity_type: "booking_request",
        entity_id: p.id,
        request_id: requestId,
      })),
    );

  return {
    examined: live?.length ?? 0,
    changed: checkedIn + completed,
    notes: `checkedIn=${checkedIn} completed=${completed} purged=${purged?.length ?? 0} failed=${failed}`,
  };
};
