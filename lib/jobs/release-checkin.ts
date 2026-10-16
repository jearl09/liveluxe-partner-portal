/**
 * release-checkin — spec §10.6 "Check-in pack release", §8.4, §21.2.
 * Hourly: every CONFIRMED booking whose check-in minus the release offset
 * (per-property override, else settings `checkin.release_offset_hours`) has
 * passed gets checkin_released_at stamped, an audit row, an in-app notification
 * for the booker and an email. The pack itself is only ever read through the
 * checkin_pack() RPC, which logs each view. Ops can release early by hand
 * (`releaseCheckinNow`, capability checkin.release).
 */
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow } from "@/lib/db/types";
import { instantBeforeCheckIn } from "@/lib/domain/dates";
import { partnerPropertyName } from "@/lib/domain/property-name";
import { env } from "@/lib/env";
import { sendCheckinReady } from "@/lib/payments/notify";
import { slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import type { JobFn } from "./registry";

interface ListingBits {
  id: string;
  public_name: string;
  internal_name: string | null;
  timezone: string;
  checkin_from: string | null;
  checkin_release_offset_hours: number | null;
}

/** Stamp the release and tell the partner. Idempotent: a second call is a no-op. */
export async function releaseCheckin(
  b: BookingRequestRow,
  listing: ListingBits,
  by: { actorType: "system" | "livluxe"; actorId: string | null },
  requestId: string,
  now = new Date(),
): Promise<boolean> {
  const db = adminDb();
  const { data: claimed } = await db
    .from("booking_requests")
    .update({ checkin_released_at: now.toISOString() })
    .eq("id", b.id)
    .is("checkin_released_at", null)
    .in("status", ["CONFIRMED", "CHECKED_IN"])
    .select("*")
    .maybeSingle();
  if (!claimed) return false;

  await db.from("audit_log").insert({
    actor_type: by.actorType,
    actor_id: by.actorId,
    action: "booking.checkin_released",
    entity_type: "booking_request",
    entity_id: b.id,
    after: { releasedAt: now.toISOString(), manual: by.actorType !== "system" } as never,
    request_id: requestId,
  });
  await db.from("notifications").insert({
    user_id: b.created_by,
    type: "checkin_released",
    payload: {
      requestId: b.id,
      reference: b.reference,
      url: `${env().NEXT_PUBLIC_APP_URL}/requests/${b.id}`,
    } as never,
  });
  await sendCheckinReady(claimed, partnerPropertyName(listing.public_name, listing.internal_name), requestId);
  log.info("checkin.released", { requestId, reference: b.reference, manual: by.actorType !== "system" });
  return true;
}

export const releaseCheckinJob: JobFn = async ({ requestId }) => {
  const db = adminDb();
  const now = new Date();
  const [{ data: setting }, { data: due, error }] = await Promise.all([
    db.from("settings").select("value").eq("key", "checkin.release_offset_hours").maybeSingle(),
    db
      .from("booking_requests")
      .select("*")
      .in("status", ["CONFIRMED", "CHECKED_IN"])
      .is("checkin_released_at", null)
      .lte("check_in", new Date(now.getTime() + 15 * 86_400_000).toISOString().slice(0, 10))
      .limit(500),
  ]);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  const defaultOffset = Number(setting?.value ?? 48) || 48;

  const listingIds = [...new Set((due ?? []).map((b) => b.listing_id))];
  const { data: listings } = listingIds.length
    ? await db
        .from("listings")
        .select("id, public_name, internal_name, timezone, checkin_from, checkin_release_offset_hours")
        .in("id", listingIds)
    : { data: [] as ListingBits[] };
  const byId = new Map((listings ?? []).map((l) => [l.id, l as ListingBits]));

  let released = 0;
  for (const b of due ?? []) {
    const l = byId.get(b.listing_id);
    if (!l) continue;
    const at = instantBeforeCheckIn(
      b.check_in,
      l.checkin_from,
      l.timezone,
      l.checkin_release_offset_hours ?? defaultOffset,
    );
    if (at.getTime() > now.getTime()) continue;
    try {
      if (await releaseCheckin(b, l, { actorType: "system", actorId: null }, requestId, now)) released++;
    } catch (e) {
      log.error("checkin.release_failed", { requestId, reference: b.reference, error: String(e) });
    }
  }
  if (released) await slack("bookings", `:key: Check-in details released for ${released} booking(s).`);
  return { examined: due?.length ?? 0, changed: released, notes: `released=${released}` };
};
