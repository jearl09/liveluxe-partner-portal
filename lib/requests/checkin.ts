/**
 * Check-in pack: what to show, when to release, who looked — spec §8.4, §10.6.
 *
 *   checkinView      tier + timing + the fields allowed at that tier (decrypted here, nowhere else)
 *   releaseCheckin   stamp the booking, notify the submitter, Slack, audit (cron or ops)
 *   recordAccess     one access-log row per view of a released pack (user, IP, UA)
 *
 * Reads go through the service role because listing_access_details is RLS-locked
 * to Live Luxe; the tier function is the gate, and it runs before any decrypt.
 */
import "server-only";
import { adminDb, appendAudit } from "@/lib/db/admin";
import type { BookingRequestRow, ListingAccessDetailsRow } from "@/lib/db/types";
import {
  canReleaseManually,
  checkinTier,
  checkinTiming,
  normaliseOffset,
  type CheckinTier,
  type CheckinTiming,
} from "@/lib/domain/checkin";
import { DomainError } from "@/lib/domain/errors";
import { can, type SessionClaims } from "@/lib/domain/permissions";
import { slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { sendCheckinPackReleased } from "@/lib/payments/notify";
import { accessKeyConfigured, decryptSecret } from "@/lib/security/access-crypto";

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

async function loadOffsetSetting(): Promise<number> {
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
  const tier = checkinTier({ status: b.status, releasedAt: b.checkin_released_at, hiddenFrom: timing.hiddenFrom, now });
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
    releasedAt: b.checkin_released_at,
    canReleaseNow: canReleaseManually(b.status, b.checkin_released_at),
    address,
    pack,
  };
}

/** Ops view of the pack regardless of tier (they can see Hostaway anyway); still logged by the caller. */
export async function opsPackPreview(b: BookingRequestRow): Promise<FullTier> {
  const { data: a } = await adminDb()
    .from("listing_access_details")
    .select("*")
    .eq("listing_id", b.listing_id)
    .maybeSingle();
  return fullTier(a ?? null);
}

/**
 * Release the pack. Idempotent: a second call returns the row unchanged. The
 * email goes to the submitter; codes are never in the email, only the link (§8.4
 * logs every view, which mail cannot do).
 */
export async function releaseCheckin(
  b: BookingRequestRow,
  input: {
    by: { type: "system" } | { type: "livluxe"; userId: string | null; name: string | null };
    requestId: string;
  },
): Promise<BookingRequestRow> {
  if (b.checkin_released_at) return b;
  if (!canReleaseManually(b.status, b.checkin_released_at))
    throw new DomainError("INVALID_STATE_TRANSITION", { from: b.status, to: "checkin_released" });
  const db = adminDb();
  const releasedAt = new Date().toISOString();
  const { data, error } = await db
    .from("booking_requests")
    .update({
      checkin_released_at: releasedAt,
      checkin_released_by: input.by.type === "livluxe" ? input.by.userId : null,
    })
    .eq("id", b.id)
    .is("checkin_released_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`checkin release failed: ${error.message}`);
  if (!data) {
    const { data: fresh } = await db.from("booking_requests").select("*").eq("id", b.id).single();
    return fresh ?? b;
  }

  const { data: listing } = await db.from("listings").select("public_name").eq("id", b.listing_id).maybeSingle();
  const propertyName = listing?.public_name ?? "the property";
  const how = input.by.type === "system" ? "on schedule" : `early by ${input.by.name ?? "Live Luxe"}`;

  await appendAudit({
    actorType: input.by.type,
    actorId: input.by.type === "livluxe" ? input.by.userId : null,
    action: "checkin.released",
    entityType: "booking_request",
    entityId: b.id,
    after: { releasedAt, how },
    requestId: input.requestId,
  }).catch((e) => log.warn("checkin.audit_failed", { requestId: input.requestId, error: String(e) }));

  await db
    .from("notifications")
    .insert({
      user_id: b.created_by,
      type: "checkin_released",
      payload: { bookingId: b.id, reference: b.reference, propertyName, url: `/requests/${b.id}` } as never,
    })
    .then(({ error: nErr }) => {
      if (nErr) log.warn("checkin.notification_insert_failed", { requestId: input.requestId, error: nErr.message });
    });

  await sendCheckinPackReleased(data, propertyName, input.requestId);
  await slack(
    "bookings",
    `:key: Check-in pack released ${how} · ${data.reference} · ${propertyName} · ${data.check_in} → ${data.check_out}`,
  );
  log.info("checkin.released", { requestId: input.requestId, reference: data.reference, how });
  return data;
}

/** Ops action from the booking page. */
export async function releaseCheckinNow(claims: SessionClaims, b: BookingRequestRow, requestId: string) {
  if (!can(claims.role, "checkin.release")) throw new DomainError("FORBIDDEN");
  const { data: me } = await adminDb()
    .from("partner_users")
    .select("id, full_name")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();
  return releaseCheckin(b, {
    by: { type: "livluxe", userId: me?.id ?? null, name: me?.full_name ?? null },
    requestId,
  });
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
