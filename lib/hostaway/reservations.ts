/**
 * Write the confirmed booking into Hostaway — spec §6.7 (highest-risk call), §17.3.
 *
 * Preconditions the caller guarantees: live availability was re-checked at
 * approval and the exclusion constraint holds the dates. This module adds the
 * outbox discipline:
 *   1. the idempotency key is stored on the booking BEFORE the call, with
 *      hostaway_write_attempted_at and an audit row ("attempt");
 *   2. the call is made once — never retried blindly;
 *   3. the outcome is recorded (reservation id + hostaway_written_at, or the error);
 *      an ambiguous timeout is resolved by listing reservations, not by writing again.
 *
 * Where the write lands is decided by lib/env.ts: the live account in production,
 * or the declared TEST account when HOSTAWAY_WRITE_TARGET=test. Anywhere else the
 * write is skipped and reported, never faked.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow } from "@/lib/db/types";
import { env, hostawayWriteTarget } from "@/lib/env";
import { inspectWriteBack, type ReservationLike } from "@/lib/domain/hostaway-reconciliation";
import { paymentKeys, splitGuestName } from "@/lib/domain/payments";
import { alertCritical } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { hostaway } from "./api";
import type { HostawayReservation } from "./types";

/** Hostaway's own "direct" channel id, used when neither settings nor env name a partner channel. */
const DIRECT_CHANNEL_ID = 2000;

/** Outcomes the caller can act on. `transient` failures are retried by the drain job; others need a human. */
export type ReservationOutcome =
  | { status: "created" | "existing"; reservationId: number }
  | { status: "skipped"; reason: "writes_disabled" }
  | { status: "failed"; reason: string; transient: boolean };

const TRANSIENT_CODES = new Set([
  "TIMEOUT",
  "SERVER_ERROR",
  "RATE_LIMITED",
  "CIRCUIT_OPEN",
  "UNAUTHORIZED",
  "HOSTAWAY_WRITE_AMBIGUOUS",
]);

export interface WriteBackConfig {
  channelId: number;
  referenceCustomFieldId: number | null;
}

/** §6.7 "direct-booking channel": settings first, env second, Hostaway's generic direct channel last. */
export async function writeBackConfig(): Promise<WriteBackConfig> {
  const { data } = await adminDb()
    .from("settings")
    .select("key, value")
    .in("key", ["hostaway.direct_channel_id", "hostaway.reference_custom_field_id"]);
  const get = (k: string) => data?.find((r) => r.key === k)?.value;
  const channel = Number(get("hostaway.direct_channel_id"));
  const field = Number(get("hostaway.reference_custom_field_id"));
  return {
    channelId:
      Number.isInteger(channel) && channel > 0 ? channel : (env().HOSTAWAY_DIRECT_CHANNEL_ID ?? DIRECT_CHANNEL_ID),
    referenceCustomFieldId: Number.isInteger(field) && field > 0 ? field : null,
  };
}

export function toReservationLike(r: HostawayReservation, referenceFieldId: number | null): ReservationLike {
  const ref = referenceFieldId
    ? (r.customFieldValues?.find((c) => c.customFieldId === referenceFieldId)?.value ?? null)
    : null;
  const extra = r as unknown as { guestEmail?: string | null; updatedOn?: string | null };
  return {
    id: r.id,
    status: r.status,
    arrivalDate: r.arrivalDate,
    departureDate: r.departureDate,
    guestEmail: extra.guestEmail ?? null,
    channelId: r.channelId ?? null,
    platformReference: ref,
    updatedOn: extra.updatedOn ?? null,
  };
}

async function audit(action: string, booking: BookingRequestRow, after: Record<string, unknown>, requestId: string) {
  const { error } = await adminDb()
    .from("audit_log")
    .insert({
      actor_type: "system",
      actor_id: null,
      action,
      entity_type: "booking_request",
      entity_id: booking.id,
      before: null,
      after: after as never,
      request_id: requestId,
    });
  if (error) log.warn("hostaway.audit_failed", { requestId, action, error: error.message });
}

export async function ensureHostawayReservation(
  booking: BookingRequestRow,
  listing: { hostawayListingId: number; name: string },
  requestId: string,
): Promise<ReservationOutcome> {
  if (booking.hostaway_reservation_id) return { status: "existing", reservationId: booking.hostaway_reservation_id };
  const target = hostawayWriteTarget();
  if (!target) {
    log.warn("hostaway.reservation.skipped", { requestId, reference: booking.reference, reason: "writes_disabled" });
    return { status: "skipped", reason: "writes_disabled" };
  }

  const db = adminDb();
  const key = booking.hostaway_write_key ?? paymentKeys.hostaway(booking.id);
  const cfg = await writeBackConfig();

  // 1. Mark intent before the call (outbox).
  const { error: markErr } = await db
    .from("booking_requests")
    .update({
      hostaway_write_key: key,
      hostaway_write_attempted_at: new Date().toISOString(),
      hostaway_write_attempts: (booking.hostaway_write_attempts ?? 0) + 1,
    })
    .eq("id", booking.id);
  if (markErr) return { status: "failed", reason: `could not store write key: ${markErr.message}`, transient: true };
  await audit(
    "hostaway.reservation.create.attempt",
    booking,
    { key, attempt: (booking.hostaway_write_attempts ?? 0) + 1, target, channelId: cfg.channelId },
    requestId,
  );

  // 2. The call.
  const guest = splitGuestName(booking.guest_name);
  const res = await hostaway.createReservation(
    {
      listingMapId: listing.hostawayListingId,
      channelId: cfg.channelId,
      arrivalDate: booking.check_in,
      departureDate: booking.check_out,
      guestFirstName: guest.first,
      guestLastName: guest.last,
      guestEmail: booking.guest_email ?? undefined,
      phone: booking.guest_phone ?? undefined,
      numberOfGuests: booking.guests_adults + booking.guests_children,
      totalPrice: (booking.total_cents ?? 0) / 100,
      currency: booking.currency,
      ...(cfg.referenceCustomFieldId
        ? { customFieldValues: [{ customFieldId: cfg.referenceCustomFieldId, value: booking.reference }] }
        : {}),
    },
    key,
  );

  // 3. Record the outcome.
  let reservationId: number | null = res.ok ? res.data.id : null;

  if (!res.ok && res.code === "TIMEOUT") {
    // Ambiguous: the write may have landed. Look before writing again (§6.7, §17.3).
    const found = await hostaway.listReservations({
      listingId: listing.hostawayListingId,
      arrivalStartDate: booking.check_in,
      arrivalEndDate: booking.check_in,
      limit: 50,
    });
    const findings = found.ok
      ? inspectWriteBack(
          {
            reference: booking.reference,
            checkIn: booking.check_in,
            checkOut: booking.check_out,
            guestEmail: booking.guest_email ?? null,
            hostawayReservationId: null,
          },
          found.data.map((r) => toReservationLike(r, cfg.referenceCustomFieldId)),
        )
      : null;
    if (findings?.ours && !findings.cancelledUpstream) {
      reservationId = findings.ours.id;
      log.warn("hostaway.reservation.timeout_resolved", { requestId, reference: booking.reference, reservationId });
    } else {
      await recordFailure(booking, "HOSTAWAY_WRITE_AMBIGUOUS", requestId);
      await alertCritical("Hostaway reservation write ambiguous", {
        reference: booking.reference,
        requestId,
        resolvedBy: found.ok ? "listed, no match" : `list failed: ${found.code}`,
      });
      return { status: "failed", reason: "HOSTAWAY_WRITE_AMBIGUOUS", transient: true };
    }
  } else if (!res.ok) {
    log.error("hostaway.reservation.failed", {
      requestId,
      reference: booking.reference,
      code: res.code,
      msg: res.message,
    });
    await recordFailure(booking, `${res.code}: ${res.message}`, requestId);
    return { status: "failed", reason: res.code, transient: TRANSIENT_CODES.has(res.code) };
  }

  const { error } = await db
    .from("booking_requests")
    .update({
      hostaway_reservation_id: reservationId,
      hostaway_written_at: new Date().toISOString(),
      hostaway_last_error: null,
    })
    .eq("id", booking.id);
  if (error)
    log.error("hostaway.reservation.save_failed", { requestId, reference: booking.reference, error: error.message });
  await audit("hostaway.reservation.create.result", booking, { reservationId, target }, requestId);
  log.info("hostaway.reservation.created", { requestId, reference: booking.reference, reservationId, target });
  return { status: "created", reservationId: reservationId! };
}

async function recordFailure(booking: BookingRequestRow, reason: string, requestId: string) {
  await adminDb()
    .from("booking_requests")
    .update({ hostaway_last_error: reason.slice(0, 500) })
    .eq("id", booking.id);
  await audit("hostaway.reservation.create.result", booking, { error: reason }, requestId);
}

export type CancelReservationOutcome =
  | { status: "cancelled" | "none" }
  | { status: "skipped"; reason: "writes_disabled" }
  | { status: "failed"; reason: string };

/**
 * Cancel the Hostaway reservation for a cancelled booking (spec §6.7 "Cancel
 * reservation": Hostaway first, then Stripe, so inventory is released even if the
 * refund needs manual follow-up). No reservation → nothing to do.
 */
export async function cancelHostawayReservation(
  booking: BookingRequestRow,
  requestId: string,
): Promise<CancelReservationOutcome> {
  if (!booking.hostaway_reservation_id) return { status: "none" };
  if (!hostawayWriteTarget()) {
    log.warn("hostaway.reservation.cancel_skipped", {
      requestId,
      reference: booking.reference,
      reason: "writes_disabled",
    });
    return { status: "skipped", reason: "writes_disabled" };
  }
  // The dedicated cancel endpoint; the general update with status "cancelled" does not release the nights.
  const res = await hostaway.cancelReservation(
    booking.hostaway_reservation_id,
    "host",
    `${paymentKeys.hostaway(booking.id)}:cancel`,
  );
  if (!res.ok) {
    log.error("hostaway.reservation.cancel_failed", {
      requestId,
      reference: booking.reference,
      code: res.code,
      msg: res.message,
    });
    await alertCritical("Hostaway reservation cancel failed", {
      reference: booking.reference,
      reservationId: booking.hostaway_reservation_id,
      code: res.code,
      requestId,
    });
    return { status: "failed", reason: res.code };
  }
  await audit("hostaway.reservation.cancel", booking, { reservationId: booking.hostaway_reservation_id }, requestId);
  log.info("hostaway.reservation.cancelled", {
    requestId,
    reference: booking.reference,
    reservationId: booking.hostaway_reservation_id,
  });
  return { status: "cancelled" };
}

export type UpdateReservationOutcome =
  | { status: "updated" | "none" }
  | { status: "skipped"; reason: "writes_disabled" }
  | { status: "failed"; reason: string };

/**
 * §6.7 "Update reservation": an approved extension or early departure changes the
 * departure date. The caller has already re-checked availability for the added
 * nights and holds the approved modification record; the key is per modification.
 */
export async function updateHostawayReservationDates(
  booking: BookingRequestRow,
  dates: { checkIn: string; checkOut: string },
  modificationId: string,
  requestId: string,
): Promise<UpdateReservationOutcome> {
  if (!booking.hostaway_reservation_id) return { status: "none" };
  if (!hostawayWriteTarget()) {
    log.warn("hostaway.reservation.update_skipped", { requestId, reference: booking.reference });
    return { status: "skipped", reason: "writes_disabled" };
  }
  const res = await hostaway.updateReservation(
    booking.hostaway_reservation_id,
    { arrivalDate: dates.checkIn, departureDate: dates.checkOut },
    `${paymentKeys.hostaway(booking.id)}:mod:${modificationId}`,
  );
  if (!res.ok) {
    log.error("hostaway.reservation.update_failed", { requestId, reference: booking.reference, code: res.code });
    await alertCritical("Hostaway reservation update failed", {
      reference: booking.reference,
      reservationId: booking.hostaway_reservation_id,
      modificationId,
      code: res.code,
      requestId,
    });
    return { status: "failed", reason: res.code };
  }
  await audit(
    "hostaway.reservation.update",
    booking,
    { reservationId: booking.hostaway_reservation_id, modificationId, ...dates },
    requestId,
  );
  return { status: "updated" };
}
