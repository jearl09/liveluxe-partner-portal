/**
 * release-checkin — hourly release of access packs at check-in − N hours
 * (spec §10.6, §21.2). N is settings.checkin.release_offset_hours with a
 * per-listing override; the moment is the property's local check-in time.
 * Each booking is released on its own so one failure never blocks the rest.
 */
import { adminDb } from "@/lib/db/admin";
import { addDays, todayIn } from "@/lib/domain/dates";
import { checkinTiming, normaliseOffset, releaseDue, RELEASABLE_STATUSES } from "@/lib/domain/checkin";
import { log } from "@/lib/observability/logger";
import { releaseCheckin } from "@/lib/requests/checkin";
import type { JobFn } from "./registry";

export const releaseCheckinJob: JobFn = async ({ requestId }) => {
  const db = adminDb();
  const now = new Date();
  const { data: setting } = await db
    .from("settings")
    .select("value")
    .eq("key", "checkin.release_offset_hours")
    .maybeSingle();
  const defaultOffset = normaliseOffset(setting?.value);

  // Candidate window: anything checking in within the widest plausible offset (+1 day for timezones).
  const horizon = addDays(todayIn("UTC", now), Math.ceil(defaultOffset / 24) + 8);
  const { data: due, error } = await db
    .from("booking_requests")
    .select("*")
    .in("status", [...RELEASABLE_STATUSES])
    .is("checkin_released_at", null)
    .lte("check_in", horizon)
    .order("check_in", { ascending: true })
    .limit(200);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  if (!due?.length) return { examined: 0, changed: 0, notes: "nothing due" };

  const listingIds = [...new Set(due.map((b) => b.listing_id))];
  const { data: listings, error: lErr } = await db
    .from("listings")
    .select("id, timezone, checkin_from, checkout_by, checkin_release_offset_hours")
    .in("id", listingIds);
  if (lErr) throw new Error(`listings read failed: ${lErr.message}`);
  const byListing = new Map((listings ?? []).map((l) => [l.id, l]));

  let released = 0;
  let failed = 0;
  for (const b of due) {
    const l = byListing.get(b.listing_id);
    if (!l) continue;
    const t = checkinTiming({
      checkIn: b.check_in,
      checkOut: b.check_out,
      timezone: l.timezone,
      checkinFrom: l.checkin_from,
      checkoutBy: l.checkout_by,
      offsetHours: l.checkin_release_offset_hours ?? defaultOffset,
    });
    if (!releaseDue({ status: b.status, releasedAt: b.checkin_released_at, releaseDueAt: t.releaseDueAt, now }))
      continue;
    try {
      await releaseCheckin(b, { by: { type: "system" }, requestId });
      released++;
    } catch (e) {
      failed++;
      log.error("release_checkin.failed", {
        requestId,
        reference: b.reference,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { examined: due.length, changed: released, notes: `released=${released} failed=${failed}` };
};
