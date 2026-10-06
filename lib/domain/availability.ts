/**
 * Availability resolution — spec §6.4.2 and §15.1.
 *
 * Pure functions over already-fetched calendar rows. The SQL version of the same
 * rules lives in supabase/migrations (search_available_listings). Both must agree;
 * tests/unit/availability.test.ts pins the TypeScript side.
 */
import { DomainError } from "./errors";

export type DayStatus = "available" | "blocked" | "reserved" | "pending" | "unknown";

export interface CalendarDay {
  /** ISO date, property-local (YYYY-MM-DD). */
  date: string;
  status: DayStatus;
  isAvailable: boolean;
  /** Multi-unit listings only; null for single units. */
  allotment: number | null;
  /** Null = unknown. Never substitute a default (§6.6.2). */
  priceCents: number | null;
  minStay: number | null;
  closedOnArrival: boolean;
  closedOnDeparture: boolean;
}

export interface ListingLimits {
  minNights: number;
  maxNights: number | null;
  maxGuests: number;
  maxPets: number;
}

export interface StayRequest {
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD, exclusive
  adults: number;
  children: number;
  pets: number;
}

/**
 * The allotment rule (§6.4.2). For multi-unit properties availability is governed
 * by allotment, not by the day's status field.
 */
export function dayIsAvailable(day: Pick<CalendarDay, "isAvailable" | "allotment" | "status">): boolean {
  if (typeof day.allotment === "number") return day.allotment > 0;
  return day.isAvailable && day.status === "available";
}

/** Inclusive list of ISO dates from checkIn to checkOut-1, computed on calendar dates (never elapsed hours — §17.1 DST row). */
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const [y1, m1, d1] = checkIn.split("-").map(Number);
  const [y2, m2, d2] = checkOut.split("-").map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  if (!(end > start)) return out;
  for (let t = start; t < end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export interface AvailabilityResult {
  available: boolean;
  /** Every night is priced; false means "price on application". */
  quotable: boolean;
  nights: number;
  requiredMinStay: number;
  missingDates: string[];
  unavailableDates: string[];
  unpricedDates: string[];
  reason?: "gap" | "unavailable" | "min_stay" | "max_stay" | "closed_on_arrival" | "closed_on_departure" | "capacity";
}

/**
 * Resolves whether a stay can be offered, applying every rule in §15.1.
 * Fails closed: a missing day is unavailable, never assumed available.
 */
export function resolveAvailability(
  days: readonly CalendarDay[],
  limits: ListingLimits,
  stay: StayRequest,
): AvailabilityResult {
  const wanted = nightsBetween(stay.checkIn, stay.checkOut);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const missingDates: string[] = [];
  const unavailableDates: string[] = [];
  const unpricedDates: string[] = [];
  let maxMinStay = 0;

  for (const date of wanted) {
    const day = byDate.get(date);
    if (!day) {
      missingDates.push(date);
      continue;
    }
    if (!dayIsAvailable(day)) unavailableDates.push(date);
    if (day.priceCents === null) unpricedDates.push(date);
    if (day.minStay && day.minStay > maxMinStay) maxMinStay = day.minStay;
  }

  const requiredMinStay = Math.max(maxMinStay, limits.minNights, 1);
  const base = {
    nights: wanted.length,
    requiredMinStay,
    missingDates,
    unavailableDates,
    unpricedDates,
    quotable: unpricedDates.length === 0 && missingDates.length === 0,
  };

  const guests = stay.adults + stay.children;
  if (guests > limits.maxGuests || stay.pets > limits.maxPets) {
    return { ...base, available: false, reason: "capacity" };
  }
  if (missingDates.length) return { ...base, available: false, reason: "gap" };
  if (unavailableDates.length) return { ...base, available: false, reason: "unavailable" };
  if (wanted.length < requiredMinStay) return { ...base, available: false, reason: "min_stay" };
  if (limits.maxNights !== null && wanted.length > limits.maxNights) {
    return { ...base, available: false, reason: "max_stay" };
  }

  const arrival = byDate.get(stay.checkIn);
  if (arrival?.closedOnArrival) return { ...base, available: false, reason: "closed_on_arrival" };
  const departure = byDate.get(stay.checkOut);
  if (departure?.closedOnDeparture) return { ...base, available: false, reason: "closed_on_departure" };

  return { ...base, available: true };
}

/** Throws the matching DomainError for a non-available result; no-op if available. */
export function assertAvailable(result: AvailabilityResult, listingId: string): void {
  if (result.available) return;
  switch (result.reason) {
    case "capacity":
      throw new DomainError("CAPACITY_EXCEEDED", { listingId });
    case "min_stay":
      throw new DomainError("MIN_STAY_NOT_MET", { listingId, requiredMinStay: result.requiredMinStay });
    default:
      throw new DomainError("DATES_UNAVAILABLE", {
        listingId,
        conflictingDates: [...result.missingDates, ...result.unavailableDates],
        reason: result.reason,
      });
  }
}
