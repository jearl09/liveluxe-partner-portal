/**
 * Write-back reconciliation rules — spec §6.7 (outbox), §17.3 ("write times out",
 * "duplicate reservation", "reservation cancelled directly in Hostaway", "clock skew").
 * Pure: the job fetches reservations; this decides what they mean for a booking.
 */
import { clampToNow } from "./dates";

/** The subset of a Hostaway reservation the rules need. */
export interface ReservationLike {
  id: number;
  status: string | null;
  arrivalDate: string;
  departureDate: string;
  guestEmail?: string | null;
  channelId?: number | null;
  /** Value of the platform-reference custom field, when the account has one configured. */
  platformReference?: string | null;
  updatedOn?: string | null;
}

export interface BookingLike {
  reference: string;
  checkIn: string;
  checkOut: string;
  guestEmail: string | null;
  hostawayReservationId: number | null;
}

/** Hostaway statuses that mean the stay is no longer going ahead. */
export const CANCELLED_RESERVATION_STATUSES = new Set([
  "cancelled",
  "canceled",
  "cancelledByOwner",
  "cancelledByAdmin",
  "cancelledByGuest",
  "cancelledByHost",
  "declined",
  "expired",
  "inquiryNotPossible",
]);

export const isCancelledStatus = (status: string | null | undefined): boolean =>
  !!status && CANCELLED_RESERVATION_STATUSES.has(status);

/** Does this reservation look like it was written for this booking? */
export function matchesBooking(r: ReservationLike, b: BookingLike): boolean {
  if (b.hostawayReservationId != null && r.id === b.hostawayReservationId) return true;
  if (r.platformReference && r.platformReference === b.reference) return true;
  return (
    r.arrivalDate === b.checkIn &&
    r.departureDate === b.checkOut &&
    (r.guestEmail ?? null) === (b.guestEmail ?? null) &&
    !isCancelledStatus(r.status)
  );
}

export interface WriteBackFindings {
  /** The reservation we consider ours (by id, then by reference, then by dates + guest). */
  ours: ReservationLike | null;
  /** Other live reservations that also match this booking — §17.3 "duplicate reservation". */
  duplicates: ReservationLike[];
  /** Our reservation exists but Hostaway says it is cancelled — §17.3 "cancelled directly in Hostaway". */
  cancelledUpstream: boolean;
  /** Our reservation id is set but nothing in Hostaway carries it. */
  missing: boolean;
}

export function inspectWriteBack(b: BookingLike, reservations: ReservationLike[]): WriteBackFindings {
  const matching = reservations.filter((r) => matchesBooking(r, b));
  const byId = b.hostawayReservationId != null ? matching.find((r) => r.id === b.hostawayReservationId) : undefined;
  const byRef = matching.find((r) => r.platformReference === b.reference && !isCancelledStatus(r.status));
  const live = matching.filter((r) => !isCancelledStatus(r.status));
  const ours = byId ?? byRef ?? live[0] ?? matching[0] ?? null;
  const duplicates = live.filter((r) => ours && r.id !== ours.id);
  return {
    ours,
    duplicates,
    cancelledUpstream: !!ours && isCancelledStatus(ours.status),
    missing: b.hostawayReservationId != null && !byId,
  };
}

/**
 * §17.3 "Clock skew between systems": a Hostaway timestamp in the future is
 * clamped to now for monotonicity comparisons, and the anomaly is reported.
 */
export function normaliseUpstreamTimestamp(
  iso: string | null | undefined,
  now: Date,
): { value: string | null; skewed: boolean; skewMs: number } {
  if (!iso) return { value: null, skewed: false, skewMs: 0 };
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return { value: null, skewed: false, skewMs: 0 };
  const clamped = clampToNow(parsed, now);
  return { value: new Date(clamped).toISOString(), skewed: clamped !== parsed, skewMs: parsed - clamped };
}
