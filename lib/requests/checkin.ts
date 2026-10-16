/**
 * Check-in pack read models — spec §8.4 (exposure rules), §10.6 (release).
 *
 *   checkinView          tier (none | approx | address | full) + timing + the fields that tier allows;
 *                        secrets are decrypted here (ACCESS_DETAILS_KEY) and nowhere else
 *   recordCheckinAccess  one checkin_access_log row per partner view (user, IP, user agent)
 *   loadCheckinPack      the checkin_pack() RPC (plaintext bytea; kept for the integration suite)
 *   releaseCheckinNow    ops early release (capability checkin.release)
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingRequestRow, Database, ListingAccessDetailsRow } from "@/lib/db/types";
import {
  canReleaseManually,
  checkinTier,
  checkinTiming,
  normaliseOffset,
  type CheckinTier,
  type CheckinTiming,
} from "@/lib/domain/checkin";
import { DomainError } from "@/lib/domain/errors";
import type { SessionClaims } from "@/lib/domain/permissions";
import { can } from "@/lib/domain/permissions";
import { releaseCheckin } from "@/lib/jobs/release-checkin";
import { loadBookingAdmin } from "@/lib/payments/intents";
import { log } from "@/lib/observability/logger";
import { accessKeyConfigured, decryptSecret } from "@/lib/security/access-crypto";

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
    .select("id, public_name, internal_name, timezone, checkin_from, checkin_release_offset_hours")
    .eq("id", b.listing_id)
    .maybeSingle();
  if (!listing) throw new DomainError("NOT_FOUND", { listingId: b.listing_id });
  const { data: me } = await adminDb().from("partner_users").select("id").eq("auth_user_id", claims.sub).maybeSingle();
  return releaseCheckin(b, listing, { actorType: "livluxe", actorId: me?.id ?? null }, requestId);
}

export interface AddressTier {
  addressLine: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  checkinFrom: string | null;
  checkinTo: string | null;
  checkoutBy: string | null;
  parkingNotes: string | null;
}

export interface FullTier {
  doorCode: string | null;
  wifiSsid: string | null;
  wifiPassword: string | null;
  accessInstructions: string | null;
  checkinInstructions: string | null;
  specialInstructions: string | null;
  emergencyContact: string | null;
  /** False when ACCESS_DETAILS_KEY is unset on this environment: codes were never stored. */
  secretsStored: boolean;
}

export interface CheckinView {
  tier: CheckinTier;
  timing: CheckinTiming;
  timezone: string;
  releasedAt: string | null;
  canReleaseNow: boolean;
  address: AddressTier | null;
  pack: FullTier | null;
}

/** settings `checkin.release_offset_hours`: how long before check-in the full pack is released. */
export async function loadOffsetSetting(): Promise<number> {
  const { data } = await adminDb()
    .from("settings")
    .select("value")
    .eq("key", "checkin.release_offset_hours")
    .maybeSingle();
  return normaliseOffset(data?.value);
}

type ListingBits = {
  id: string;
  timezone: string;
  address_line: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  checkin_from: string | null;
  checkin_to: string | null;
  checkout_by: string | null;
  checkin_release_offset_hours: number | null;
};

async function loadListingBits(listingId: string): Promise<ListingBits> {
  const { data, error } = await adminDb()
    .from("listings")
    .select(
      "id, timezone, address_line, suburb, state, postcode, checkin_from, checkin_to, checkout_by, checkin_release_offset_hours",
    )
    .eq("id", listingId)
    .single();
  if (error || !data) throw new Error(`listing read failed: ${error?.message}`);
  return data;
}

function timingFor(b: BookingRequestRow, l: ListingBits, defaultOffset: number): CheckinTiming {
  return checkinTiming({
    checkIn: b.check_in,
    checkOut: b.check_out,
    timezone: l.timezone,
    checkinFrom: l.checkin_from,
    checkoutBy: l.checkout_by,
    offsetHours: l.checkin_release_offset_hours ?? defaultOffset,
  });
}

function fullTier(a: ListingAccessDetailsRow | null): FullTier {
  return {
    doorCode: decryptSecret(a?.door_code_encrypted),
    wifiSsid: a?.wifi_ssid ?? null,
    wifiPassword: decryptSecret(a?.wifi_password_encrypted),
    accessInstructions: decryptSecret(a?.access_instructions_encrypted),
    checkinInstructions: a?.checkin_instructions ?? null,
    specialInstructions: a?.special_instructions ?? null,
    emergencyContact: a?.emergency_contact ?? null,
    secretsStored: accessKeyConfigured() && !!(a?.door_code_encrypted || a?.wifi_password_encrypted),
  };
}

/** Everything the check-in panel needs. Secrets are decrypted only when the tier is "full". */
export async function checkinView(b: BookingRequestRow, now: Date = new Date()): Promise<CheckinView> {
  const [l, defaultOffset] = await Promise.all([loadListingBits(b.listing_id), loadOffsetSetting()]);
  const timing = timingFor(b, l, defaultOffset);
  const released = b.credentials_purged_at ? null : b.checkin_released_at;
  const tier = checkinTier({ status: b.status, releasedAt: released, hiddenFrom: timing.hiddenFrom, now });
  const address: AddressTier | null =
    tier === "address" || tier === "full"
      ? {
          addressLine: l.address_line,
          suburb: l.suburb,
          state: l.state,
          postcode: l.postcode,
          checkinFrom: l.checkin_from,
          checkinTo: l.checkin_to,
          checkoutBy: l.checkout_by,
          parkingNotes: null,
        }
      : null;
  let pack: FullTier | null = null;
  if (tier === "full" || address) {
    const { data: a } = await adminDb().from("listing_access_details").select("*").eq("listing_id", l.id).maybeSingle();
    if (address) address.parkingNotes = a?.parking_notes ?? null;
    if (tier === "full") pack = fullTier(a ?? null);
  }
  return {
    tier,
    timing,
    timezone: l.timezone,
    releasedAt: released,
    canReleaseNow: canReleaseManually(b.status, b.checkin_released_at),
    address,
    pack,
  };
}

/** One row per view of a released pack (§8.4 "access is logged with user, timestamp and IP"). */
export async function recordCheckinAccess(input: {
  bookingId: string;
  claims: SessionClaims;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const db = adminDb();
  const { data: me } = await db.from("partner_users").select("id").eq("auth_user_id", input.claims.sub).maybeSingle();
  const { error } = await db.from("checkin_access_log").insert({
    booking_id: input.bookingId,
    user_id: me?.id ?? null,
    ip: input.ip && input.ip !== "unknown" ? input.ip : null,
    user_agent: input.userAgent?.slice(0, 500) ?? null,
  });
  if (error) log.warn("checkin.access_log_failed", { bookingId: input.bookingId, error: error.message });
}

/** Ops: recent views of this booking's pack. */
export async function checkinAccessLog(bookingId: string, limit = 20) {
  const db = adminDb();
  const { data } = await db
    .from("checkin_access_log")
    .select("id, user_id, ip, viewed_at")
    .eq("booking_id", bookingId)
    .order("viewed_at", { ascending: false })
    .limit(limit);
  const ids = [...new Set((data ?? []).map((x) => x.user_id).filter((x): x is string => !!x))];
  const { data: users } = ids.length
    ? await db.from("partner_users").select("id, full_name, email").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const nameOf = (id: string | null) => {
    const u = id ? (users ?? []).find((x) => x.id === id) : null;
    return u ? (u.full_name ?? u.email) : "Unknown user";
  };
  return (data ?? []).map((x) => ({ id: x.id, who: nameOf(x.user_id), ip: x.ip, at: x.viewed_at }));
}
