/**
 * Check-in detail exposure and release timing — spec §8.4, §10.6.
 *
 * What a partner may see is decided here, by one function, never by conditional
 * rendering alone. The full access pack (door code, Wi-Fi, entry instructions,
 * emergency contact) is released at check-in minus N hours — a setting with a
 * per-property override — or earlier by ops, and hidden again 24 h after checkout.
 * Cancellation revokes it immediately.
 */
import type { BookingStatus } from "./booking-state-machine";
import { localToUtc } from "./dates";

export const DEFAULT_RELEASE_OFFSET_HOURS = 48;
export const DEFAULT_CHECKIN_TIME = "15:00";
export const DEFAULT_CHECKOUT_TIME = "10:00";
const HIDE_AFTER_CHECKOUT_MS = 24 * 3_600_000;

/**
 *   none     nothing beyond the listing page (cancelled, declined, expired, draft)
 *   approx   suburb and jittered map point only (submitted, under review, awaiting payment)
 *   address  exact address, parking and directions; no codes (approved/confirmed, before release)
 *   full     the access pack (released, until 24 h after checkout)
 */
export type CheckinTier = "none" | "approx" | "address" | "full";

export const ADDRESS_STATUSES: readonly BookingStatus[] = ["APPROVED", "CONFIRMED", "CHECKED_IN", "COMPLETED"];
export const APPROX_STATUSES: readonly BookingStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "COUNTER_OFFERED",
  "AWAITING_PAYMENT",
];
/** Statuses whose pack the hourly job may release. */
export const RELEASABLE_STATUSES: readonly BookingStatus[] = ["CONFIRMED", "CHECKED_IN"];

export interface CheckinTiming {
  checkInAt: Date;
  checkOutAt: Date;
  releaseDueAt: Date;
  hiddenFrom: Date;
  offsetHours: number;
}

/** Property-local check-in/out instants and the release moment for one booking. */
export function checkinTiming(i: {
  checkIn: string;
  checkOut: string;
  timezone: string;
  checkinFrom: string | null;
  checkoutBy: string | null;
  /** settings.checkin.release_offset_hours, or the listing override when set. */
  offsetHours: number | null | undefined;
}): CheckinTiming {
  const offsetHours = normaliseOffset(i.offsetHours);
  const checkInAt = localToUtc(i.checkIn, i.checkinFrom ?? DEFAULT_CHECKIN_TIME, i.timezone);
  const checkOutAt = localToUtc(i.checkOut, i.checkoutBy ?? DEFAULT_CHECKOUT_TIME, i.timezone);
  return {
    checkInAt,
    checkOutAt,
    releaseDueAt: new Date(checkInAt.getTime() - offsetHours * 3_600_000),
    hiddenFrom: new Date(checkOutAt.getTime() + HIDE_AFTER_CHECKOUT_MS),
    offsetHours,
  };
}

export function normaliseOffset(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_RELEASE_OFFSET_HOURS;
}

export function checkinTier(i: {
  status: BookingStatus;
  releasedAt: string | null;
  hiddenFrom: Date;
  now: Date;
}): CheckinTier {
  if (ADDRESS_STATUSES.includes(i.status)) {
    if (i.releasedAt && i.now.getTime() < i.hiddenFrom.getTime()) return "full";
    return "address";
  }
  if (APPROX_STATUSES.includes(i.status)) return "approx";
  return "none";
}

/** True when the cron should release now: due, not yet released, booking live. */
export function releaseDue(i: {
  status: BookingStatus;
  releasedAt: string | null;
  releaseDueAt: Date;
  now: Date;
}): boolean {
  return !i.releasedAt && RELEASABLE_STATUSES.includes(i.status) && i.now.getTime() >= i.releaseDueAt.getTime();
}

/** Ops may release early for any live, paid booking; never for one that is over or cancelled. */
export function canReleaseManually(status: BookingStatus, releasedAt: string | null): boolean {
  return !releasedAt && RELEASABLE_STATUSES.includes(status);
}
