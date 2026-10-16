/**
 * Which stays a partner may pick (spec §15.1, brief §7.4). One set of rules for the property page's date picker and
 * its availability calendar, built from the same rows as the server's quote check (`resolveAvailability`), so a
 * range either control offers is one the server will price. The server re-check stays the backstop: holds and
 * bookings can land between page load and the quote.
 *
 * A stay is check-in → check-out, half-open: the nights are check-in … check-out − 1, so the check-out day may be a
 * booked night (the guest leaves that morning) but no night in between may be.
 *
 * Pure: no framework, database or date-library imports (spec §3.2).
 */
import { dayIsAvailable, type CalendarDay } from "./availability";
import { addDays, daysBetween } from "./dates";

/** What a night is, for picking. Only `open` nights can be stayed. */
export type NightState = "open" | "booked" | "unsynced" | "unpriced";

export interface StayNight {
  date: string;
  state: NightState;
  priceCents: number | null;
  minStay: number | null;
  closedOnArrival: boolean;
  closedOnDeparture: boolean;
}

export interface StayCalendar {
  /** First night in `nights` (property-local today). Earlier dates are in the past. */
  from: string;
  /** Contiguous nights from `from`. A date past the end has no synced data. */
  nights: StayNight[];
  minNights: number;
  maxNights: number | null;
}

/** A date range taken in the portal but not yet in the synced calendar: a live hold or an approved booking. */
export interface TakenRange {
  /** First night, ISO. */
  start: string;
  /** Exclusive end (the check-out day), ISO. */
  end: string;
}

export function buildStayCalendar(
  days: readonly CalendarDay[],
  taken: readonly TakenRange[],
  from: string,
  count: number,
  limits: { minNights: number; maxNights: number | null },
): StayCalendar {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const nights: StayNight[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(from, i);
    const day = byDate.get(date);
    const held = taken.some((r) => date >= r.start && date < r.end);
    const state: NightState = !day
      ? "unsynced"
      : held || !dayIsAvailable(day)
        ? "booked"
        : day.priceCents === null
          ? "unpriced"
          : "open";
    nights.push({
      date,
      state,
      priceCents: day?.priceCents ?? null,
      minStay: day?.minStay ?? null,
      closedOnArrival: day?.closedOnArrival ?? false,
      closedOnDeparture: day?.closedOnDeparture ?? false,
    });
  }
  return { from, nights, minNights: Math.max(1, limits.minNights), maxNights: limits.maxNights };
}

export type BlockReason =
  | { code: "past" }
  | { code: "booked" }
  | { code: "unsynced" }
  | { code: "unpriced" }
  | { code: "closed_on_arrival" }
  | { code: "closed_on_departure" }
  | { code: "crosses"; night: string; state: Exclude<NightState, "open"> }
  | { code: "min_stay"; nights: number }
  | { code: "max_stay"; nights: number }
  | { code: "no_stay_fits"; nights: number };

function nightAt(cal: StayCalendar, date: string): StayNight | null {
  const i = daysBetween(cal.from, date);
  return i >= 0 && i < cal.nights.length ? cal.nights[i]! : null;
}

function nightBlock(state: Exclude<NightState, "open">): BlockReason {
  return { code: state };
}

/** Why `date` cannot be a check-in, ignoring whether any check-out fits. Null when it can. */
function arrivalBlock(cal: StayCalendar, date: string): BlockReason | null {
  if (date < cal.from) return { code: "past" };
  const n = nightAt(cal, date);
  if (!n) return { code: "unsynced" };
  if (n.state !== "open") return nightBlock(n.state);
  if (n.closedOnArrival) return { code: "closed_on_arrival" };
  return null;
}

/**
 * Why `checkOut` cannot end a stay starting `checkIn`. Null when the stay is valid. The order matches what the
 * partner can act on: a stay that crosses a booked night is reported as that, before any length rule.
 */
export function checkOutBlock(cal: StayCalendar, checkIn: string, checkOut: string): BlockReason | null {
  const arrival = arrivalBlock(cal, checkIn);
  if (arrival) return arrival;
  if (checkOut <= checkIn) return { code: "past" };
  let required = cal.minNights;
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    const n = nightAt(cal, d);
    if (!n) return { code: "crosses", night: d, state: "unsynced" };
    if (n.state !== "open") return { code: "crosses", night: d, state: n.state };
    if (n.minStay && n.minStay > required) required = n.minStay;
  }
  const nights = daysBetween(checkIn, checkOut);
  if (nights < required) return { code: "min_stay", nights: required };
  if (cal.maxNights !== null && nights > cal.maxNights) return { code: "max_stay", nights: cal.maxNights };
  if (nightAt(cal, checkOut)?.closedOnDeparture) return { code: "closed_on_departure" };
  return null;
}

/** The last day a stay from `checkIn` could end: the first night after it that cannot be stayed. */
export function lastCheckOut(cal: StayCalendar, checkIn: string): string {
  let d = addDays(checkIn, 1);
  for (;;) {
    const n = nightAt(cal, d);
    if (!n || n.state !== "open") return d;
    d = addDays(d, 1);
  }
}

/**
 * Valid check-outs for a stay from `checkIn`, in order, in one forward pass (the rules of `checkOutBlock`, applied
 * incrementally). Stops after `limit` results.
 */
function scanCheckOuts(cal: StayCalendar, checkIn: string, limit: number): string[] {
  const out: string[] = [];
  if (arrivalBlock(cal, checkIn)) return out;
  let required = cal.minNights;
  for (let k = 1, night = checkIn; ; k++, night = addDays(night, 1)) {
    const n = nightAt(cal, night);
    if (!n || n.state !== "open") break;
    if (n.minStay && n.minStay > required) required = n.minStay;
    if (cal.maxNights !== null && k > cal.maxNights) break;
    const checkOut = addDays(night, 1);
    if (k >= required && !nightAt(cal, checkOut)?.closedOnDeparture) {
      out.push(checkOut);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Every valid check-out for a stay from `checkIn`, in order. Empty when no stay fits. */
export function validCheckOuts(cal: StayCalendar, checkIn: string): string[] {
  return scanCheckOuts(cal, checkIn, Number.POSITIVE_INFINITY);
}

/** Why `date` cannot be a check-in. Null when it can: an open night from which at least one valid stay fits. */
export function checkInBlock(cal: StayCalendar, date: string): BlockReason | null {
  const arrival = arrivalBlock(cal, date);
  if (arrival) return arrival;
  if (scanCheckOuts(cal, date, 1).length > 0) return null;
  // The minimum that applies from here: the listing's, or this night's own when stricter.
  return { code: "no_stay_fits", nights: Math.max(cal.minNights, nightAt(cal, date)?.minStay ?? 0) };
}

/**
 * The picker's view of one day while a stay is being chosen. With a check-in picked and no check-out yet, later
 * days are judged as check-outs and earlier days as new check-ins; otherwise every day is judged as a check-in.
 */
export function dayBlock(cal: StayCalendar, date: string, checkIn: string | null): BlockReason | null {
  if (checkIn && date > checkIn) return checkOutBlock(cal, checkIn, date);
  return checkInBlock(cal, date);
}

const DAY = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const short = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`)).replace(",", "");

/** The reason in the partner's words, for the tooltip and the screen reader. */
export function blockText(r: BlockReason): string {
  switch (r.code) {
    case "past":
      return "In the past";
    case "booked":
      return "Booked";
    case "unsynced":
      return "Not available yet";
    case "unpriced":
      return "Price on application";
    case "closed_on_arrival":
      return "Check-in not available on this day";
    case "closed_on_departure":
      return "Check-out not available on this day";
    case "crosses":
      return r.state === "booked"
        ? `The stay would cross a booked night (${short(r.night)})`
        : r.state === "unpriced"
          ? `The stay would include a night without a price (${short(r.night)})`
          : `The stay would include a night not available yet (${short(r.night)})`;
    case "min_stay":
      return `Minimum ${r.nights} nights from here`;
    case "max_stay":
      return `Maximum ${r.nights} nights`;
    case "no_stay_fits":
      return `Not enough open nights from here for the ${r.nights}-night minimum`;
  }
}

/**
 * The nearest valid stays of `nights` nights to a wanted check-in, for "try these dates instead" after the server
 * refused a range. Searches outward a day at a time, later first on a tie; returns at most `count`.
 */
export function nearestOpenStays(
  cal: StayCalendar,
  wantedCheckIn: string,
  nights: number,
  count = 2,
): { checkIn: string; checkOut: string }[] {
  const out: { checkIn: string; checkOut: string }[] = [];
  const tryAt = (d: string) => {
    const end = addDays(d, nights);
    if (!checkOutBlock(cal, d, end)) out.push({ checkIn: d, checkOut: end });
  };
  for (let step = 0; step <= cal.nights.length && out.length < count; step++) {
    tryAt(addDays(wantedCheckIn, step));
    if (step > 0 && out.length < count) tryAt(addDays(wantedCheckIn, -step));
  }
  return out.slice(0, count);
}
