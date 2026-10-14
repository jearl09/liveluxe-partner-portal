/**
 * Display rules for request lists (brief §4.7, §5.4, §5.13). Pure.
 */
import type { BookingStatus } from "./booking-state-machine";

/**
 * Guest names in lists and feeds are initial + surname ("J. Citizen"): the people behind
 * a claim have just lost their home, and a list on a shared screen is not the place for
 * their full name. One-word names stay as they are.
 */
export function maskGuest(name: string | null | undefined): string | null {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (!n) return null;
  const parts = n.split(" ");
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  return `${first[0]!.toUpperCase()}. ${last}`;
}

export interface RowNextInput {
  status: BookingStatus;
  audience: "partner" | "ops";
  now: Date;
  decisionDueAt: string | null;
  holdExpiresAt: string | null;
  checkIn: string;
  checkOut: string;
  checkinReleasedAt: string | null;
  /** Card modes with no hold yet. */
  cardNeeded?: boolean;
  when: (iso: string) => string;
  date: (isoDate: string) => string;
}

/**
 * The "Next step" cell (brief §5.4): what happens next and by when, in a few words,
 * derived from status, payment and dates.
 */
export function rowNextStep(i: RowNextInput): { text: string; urgent: boolean } {
  const ops = i.audience === "ops";
  const overdue = (iso: string | null) => !!iso && new Date(iso).getTime() < i.now.getTime();
  switch (i.status) {
    case "DRAFT":
      return { text: "Not sent", urgent: false };
    case "SUBMITTED":
    case "UNDER_REVIEW":
      if (i.cardNeeded) return { text: ops ? "Partner to hold a card" : "Hold your card", urgent: !ops };
      return i.decisionDueAt
        ? {
            text: ops
              ? `${overdue(i.decisionDueAt) ? "Was due" : "Decide by"} ${i.when(i.decisionDueAt)}`
              : `Reply by ${i.when(i.decisionDueAt)}`,
            urgent: ops && overdue(i.decisionDueAt),
          }
        : { text: ops ? "Decide" : "With Live Luxe", urgent: false };
    case "COUNTER_OFFERED":
      return {
        text: ops ? "Partner to answer" : `Answer${i.holdExpiresAt ? ` by ${i.when(i.holdExpiresAt)}` : ""}`,
        urgent: !ops,
      };
    case "APPROVED":
      return { text: "Confirming", urgent: false };
    case "AWAITING_PAYMENT":
      return {
        text: ops ? "Partner to pay" : `Pay${i.holdExpiresAt ? ` by ${i.when(i.holdExpiresAt)}` : ""}`,
        urgent: !ops,
      };
    case "CONFIRMED":
      return {
        text: i.checkinReleasedAt
          ? `Check-in ${i.date(i.checkIn)}`
          : `Check-in ${i.date(i.checkIn)} · details 48 h before`,
        urgent: false,
      };
    case "CHECKED_IN":
      return { text: `Check-out ${i.date(i.checkOut)}`, urgent: false };
    case "FAILED":
      return { text: ops ? "Reconcile and call the partner" : "Live Luxe will be in touch", urgent: ops };
    default:
      return { text: "—", urgent: false };
  }
}

/** The ops Bookings status groups (brief §6.4): four chips instead of thirteen statuses. */
export const BOOKING_GROUPS = ["all", "live", "confirmed", "closed"] as const;
export type BookingGroup = (typeof BOOKING_GROUPS)[number];

export const BOOKING_GROUP_LABELS: Record<BookingGroup, string> = {
  all: "All",
  live: "In progress",
  confirmed: "Confirmed",
  closed: "Closed",
};

export const BOOKING_GROUP_STATUSES: Record<Exclude<BookingGroup, "all">, readonly BookingStatus[]> = {
  live: ["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED", "APPROVED", "AWAITING_PAYMENT"],
  confirmed: ["CONFIRMED", "CHECKED_IN"],
  closed: ["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED", "FAILED"],
};

export function parseBookingGroup(v: string | string[] | undefined): BookingGroup {
  const s = Array.isArray(v) ? v[0] : v;
  return (BOOKING_GROUPS as readonly string[]).includes(s ?? "") ? (s as BookingGroup) : "all";
}

/** Sortable columns on the ops Bookings list, and the database column behind each. */
export const BOOKING_SORTS = {
  updated: "updated_at",
  checkin: "check_in",
  total: "total_cents",
  reference: "reference",
} as const;
export type BookingSortKey = keyof typeof BOOKING_SORTS;
export interface BookingSort {
  key: BookingSortKey;
  dir: "asc" | "desc";
}
export const DEFAULT_BOOKING_SORT: BookingSort = { key: "updated", dir: "desc" };

/** `?sort=checkin&dir=asc`, anything else falls back to newest activity first. */
export function parseBookingSort(sort: string | string[] | undefined, dir: string | string[] | undefined): BookingSort {
  const k = Array.isArray(sort) ? sort[0] : sort;
  const d = Array.isArray(dir) ? dir[0] : dir;
  if (!k || !Object.hasOwn(BOOKING_SORTS, k)) return DEFAULT_BOOKING_SORT;
  return { key: k as BookingSortKey, dir: d === "asc" ? "asc" : "desc" };
}
