/**
 * Check-in pack read models — spec §8.4 (exposure rules), §10.6 (release).
 * Partners never select listing_access_details; the checkin_pack() RPC enforces
 * the entitlement (released, not purged, own org) and logs the view.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { createServerSupabase } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";
import { DomainError } from "@/lib/domain/errors";
import type { SessionClaims } from "@/lib/domain/permissions";
import { can } from "@/lib/domain/permissions";
import { releaseCheckin } from "@/lib/jobs/release-checkin";
import { loadBookingAdmin } from "@/lib/payments/intents";

export type CheckinPack = Database["public"]["Functions"]["checkin_pack"]["Returns"][number];

/** The pack for a released booking, or null when the RPC refuses (not released / purged / not entitled). */
export async function loadCheckinPack(bookingId: string): Promise<CheckinPack | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("checkin_pack", { p_booking_id: bookingId });
  if (error) return null;
  return data?.[0] ?? null;
}

export async function checkinViewCount(bookingId: string): Promise<number> {
  const { count } = await adminDb()
    .from("checkin_access_log")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId);
  return count ?? 0;
}

/** Ops release the pack ahead of the schedule (§10.6 "Ops can release early manually"). */
export async function releaseCheckinNow(claims: SessionClaims, bookingId: string, requestId: string): Promise<boolean> {
  if (!can(claims.role, "checkin.release")) throw new DomainError("FORBIDDEN");
  const b = await loadBookingAdmin(bookingId);
  if (b.status !== "CONFIRMED" && b.status !== "CHECKED_IN")
    throw new DomainError("INVALID_STATE_TRANSITION", {
      from: b.status,
      detail: "Only a confirmed booking has a check-in pack.",
    });
  const { data: listing } = await adminDb()
    .from("listings")
    .select("id, public_name, timezone, checkin_from, checkin_release_offset_hours")
    .eq("id", b.listing_id)
    .maybeSingle();
  if (!listing) throw new DomainError("NOT_FOUND", { listingId: b.listing_id });
  const { data: me } = await adminDb().from("partner_users").select("id").eq("auth_user_id", claims.sub).maybeSingle();
  return releaseCheckin(b, listing, { actorType: "livluxe", actorId: me?.id ?? null }, requestId);
}
