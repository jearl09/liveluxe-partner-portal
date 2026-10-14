/**
 * Calendar-date arithmetic on ISO strings (YYYY-MM-DD) — spec §17.1.
 * These never touch wall-clock time, so DST transitions cannot shift a date.
 */

import { fromZonedTime } from "date-fns-tz";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Today's calendar date in a timezone, e.g. the property's. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * §17.3 "Clock skew between systems": a timestamp from another system that sits in
 * the future is clamped to now before any "is this newer than that" comparison.
 */
export function clampToNow(epochMs: number, now: Date = new Date()): number {
  return Math.min(epochMs, now.getTime());
}

/**
 * The instant `offsetHours` before a property-local check-in (§10.6 check-in pack
 * release). `checkinFrom` is the listing's earliest check-in time ("15:00"); the
 * conversion is DST-safe because it resolves the local wall-clock time in `timeZone`.
 */
export function instantBeforeCheckIn(
  checkIn: string,
  checkinFrom: string | null,
  timeZone: string,
  offsetHours: number,
): Date {
  const [hh, mm] = (checkinFrom ?? "15:00").split(":").map((n) => Number(n) || 0);
  const local = fromZonedTime(`${checkIn}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`, timeZone);
  return new Date(local.getTime() - Math.max(0, offsetHours) * 3_600_000);
}

/** The two calendar windows the sync jobs maintain (spec §6.4.1). */
export const CALENDAR_WINDOWS = {
  near: { fromOffset: 0, toOffset: 120 },
  far: { fromOffset: 121, toOffset: 400 },
} as const;

export function calendarWindow(kind: keyof typeof CALENDAR_WINDOWS, today: string): { from: string; to: string } {
  const w = CALENDAR_WINDOWS[kind];
  return { from: addDays(today, w.fromOffset), to: addDays(today, w.toOffset) };
}

function wallClockOffsetMs(instantMs: number, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(new Date(instantMs))
    .reduce<Record<string, string>>((acc, x) => ((acc[x.type] = x.value), acc), {});
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - instantMs;
}

/**
 * The UTC instant of a wall-clock time in a timezone, e.g. "2026-11-25" "15:00" in
 * Australia/Melbourne -> 2026-11-25T04:00:00Z. Two passes settle the DST offset.
 */
export function localToUtc(isoDate: string, time: string, timeZone: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  let guess = asUtc - wallClockOffsetMs(asUtc, timeZone);
  guess = asUtc - wallClockOffsetMs(guess, timeZone);
  return new Date(guess);
}
