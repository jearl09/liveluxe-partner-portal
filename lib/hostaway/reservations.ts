/**
 * Write the confirmed booking into Hostaway — spec §6.7 (highest-risk call).
 *
 * Preconditions the caller guarantees: live availability was re-checked at
 * approval and the exclusion constraint holds the dates. This module adds the
 * idempotency discipline: the key is stored on the booking BEFORE the call so a
 * retry after an ambiguous timeout reuses it, and an ambiguous outcome is
 * resolved by listing reservations rather than by writing again.
 *
 * Outside production (HOSTAWAY_ALLOW_WRITES + VERCEL_ENV guards) the write is
 * skipped and reported, never faked.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow } from "@/lib/db/types";
import { env, hostawayWritesEnabled } from "@/lib/env";
import { paymentKeys, splitGuestName } from "@/lib/domain/payments";
import { alertCritical } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { hostaway } from "./api";

/** Hostaway's own "direct" channel id, used when the account has not configured a partner channel. */
const DIRECT_CHANNEL_ID = 2000;

export type ReservationOutcome =
  | { status: "created" | "existing"; reservationId: number }
  | { status: "skipped"; reason: "writes_disabled" }
  | { status: "failed"; reason: string };

export async function ensureHostawayReservation(
  booking: BookingRequestRow,
  listing: { hostawayListingId: number; name: string },
  requestId: string,
): Promise<ReservationOutcome> {
  if (booking.hostaway_reservation_id) return { status: "existing", reservationId: booking.hostaway_reservation_id };
  if (!hostawayWritesEnabled()) {
    log.warn("hostaway.reservation.skipped", { requestId, reference: booking.reference, reason: "writes_disabled" });
    return { status: "skipped", reason: "writes_disabled" };
  }

  const db = adminDb();
  const key = booking.hostaway_write_key ?? paymentKeys.hostaway(booking.id);
  if (!booking.hostaway_write_key) {
    const { error } = await db.from("booking_requests").update({ hostaway_write_key: key }).eq("id", booking.id);
    if (error) return { status: "failed", reason: `could not store write key: ${error.message}` };
  }

  const guest = splitGuestName(booking.guest_name);
  const res = await hostaway.createReservation(
    {
      listingMapId: listing.hostawayListingId,
      channelId: env().HOSTAWAY_DIRECT_CHANNEL_ID ?? DIRECT_CHANNEL_ID,
      arrivalDate: booking.check_in,
      departureDate: booking.check_out,
      guestFirstName: guest.first,
      guestLastName: guest.last,
      guestEmail: booking.guest_email ?? undefined,
      phone: booking.guest_phone ?? undefined,
      numberOfGuests: booking.guests_adults + booking.guests_children,
      totalPrice: (booking.total_cents ?? 0) / 100,
      currency: booking.currency,
    },
    key,
  );

  let reservationId: number | null = res.ok ? res.data.id : null;

  if (!res.ok && res.code === "TIMEOUT") {
    // Ambiguous: the write may have landed. Look before writing again (§6.7).
    const found = await hostaway.listReservations({
      listingId: listing.hostawayListingId,
      arrivalStartDate: booking.check_in,
      arrivalEndDate: booking.check_in,
      limit: 20,
    });
    const match = found.ok
      ? found.data.find(
          (r) =>
            r.arrivalDate === booking.check_in &&
            r.departureDate === booking.check_out &&
            (r.guestEmail ?? null) === (booking.guest_email ?? null),
        )
      : undefined;
    if (match) reservationId = match.id;
    else {
      await alertCritical("Hostaway reservation write ambiguous", { reference: booking.reference, requestId });
      return { status: "failed", reason: "HOSTAWAY_WRITE_AMBIGUOUS" };
    }
  } else if (!res.ok) {
    log.error("hostaway.reservation.failed", {
      requestId,
      reference: booking.reference,
      code: res.code,
      msg: res.message,
    });
    return { status: "failed", reason: res.code };
  }

  const { error } = await db
    .from("booking_requests")
    .update({ hostaway_reservation_id: reservationId })
    .eq("id", booking.id);
  if (error)
    log.error("hostaway.reservation.save_failed", { requestId, reference: booking.reference, error: error.message });
  log.info("hostaway.reservation.created", { requestId, reference: booking.reference, reservationId });
  return { status: "created", reservationId: reservationId! };
}
