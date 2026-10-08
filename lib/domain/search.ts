/**
 * Partner search — spec §13.2 / §15.1. Pure parsing and summarising; the SQL
 * function search_available_listings does the gap-free availability filter.
 */
import { isIsoDate, daysBetween } from "./dates";
import { dayIsAvailable, type CalendarDay } from "./availability";
import type { Cents } from "./money";

export const SEARCH_PAGE_SIZE = 24;
export const MAX_STAY_NIGHTS = 400;

export interface SearchQuery {
  q: string;
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  pets: number;
  bedrooms: number | null;
  page: number;
}

export interface ParsedSearch {
  query: SearchQuery;
  /** Human-readable problems with the input; the page still renders without dates. */
  errors: string[];
  /** Both dates present and valid. */
  hasDates: boolean;
  nights: number;
}

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const int = (v: string, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export function parseSearchParams(raw: Raw, today?: string): ParsedSearch {
  const errors: string[] = [];
  const q = first(raw.q).trim().slice(0, 80);
  const checkInRaw = first(raw.checkIn);
  const checkOutRaw = first(raw.checkOut);
  let checkIn: string | null = isIsoDate(checkInRaw) ? checkInRaw : null;
  let checkOut: string | null = isIsoDate(checkOutRaw) ? checkOutRaw : null;

  if (checkInRaw && !checkIn) errors.push("Check-in date is not valid.");
  if (checkOutRaw && !checkOut) errors.push("Check-out date is not valid.");
  if ((checkIn && !checkOut) || (!checkIn && checkOut)) errors.push("Enter both a check-in and a check-out date.");

  let nights = 0;
  if (checkIn && checkOut) {
    nights = daysBetween(checkIn, checkOut);
    if (nights < 1) {
      errors.push("Check-out must be after check-in.");
      checkIn = checkOut = null;
      nights = 0;
    } else if (nights > MAX_STAY_NIGHTS) {
      errors.push(`Stays longer than ${MAX_STAY_NIGHTS} nights cannot be searched online.`);
      checkIn = checkOut = null;
      nights = 0;
    } else if (today && checkIn < today) {
      errors.push("Check-in cannot be in the past.");
      checkIn = checkOut = null;
      nights = 0;
    }
  }

  const bedroomsRaw = first(raw.bedrooms);
  return {
    query: {
      q,
      checkIn,
      checkOut,
      guests: int(first(raw.guests), 1, 1, 20),
      pets: int(first(raw.pets), 0, 0, 5),
      bedrooms: bedroomsRaw ? int(bedroomsRaw, 0, 0, 10) || null : null,
      page: int(first(raw.page), 1, 1, 500),
    },
    errors,
    hasDates: checkIn !== null && checkOut !== null,
    nights,
  };
}

export interface PriceSummary {
  /** Every requested night has a Hostaway price. */
  quotable: boolean;
  /** Sum of nightly rates only — fees and partner discounts are applied at quote time. */
  accommodationCents: Cents;
  nightlyAverageCents: Cents;
  pricedNights: number;
  nights: number;
}

/** Indicative pricing for a result card from the synced calendar. Null prices mean "price on application". */
export function summariseNightlyPrices(days: readonly Pick<CalendarDay, "priceCents">[], nights: number): PriceSummary {
  const priced = days.map((d) => d.priceCents).filter((p): p is Cents => typeof p === "number");
  const total = priced.reduce((a, b) => a + b, 0);
  return {
    quotable: nights > 0 && priced.length === nights,
    accommodationCents: total,
    nightlyAverageCents: priced.length ? Math.round(total / priced.length) : 0,
    pricedNights: priced.length,
    nights,
  };
}

/** Builds the query string for a search or a listing link so state stays in the URL (§13.2). */
export function searchQueryString(q: Partial<SearchQuery>): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.checkIn) p.set("checkIn", q.checkIn);
  if (q.checkOut) p.set("checkOut", q.checkOut);
  if (q.guests && q.guests !== 1) p.set("guests", String(q.guests));
  if (q.pets) p.set("pets", String(q.pets));
  if (q.bedrooms) p.set("bedrooms", String(q.bedrooms));
  if (q.page && q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Compact availability strip for a listing page: one cell per day. */
export interface StripDay {
  date: string;
  available: boolean;
  known: boolean;
  priceCents: Cents | null;
}

export function buildAvailabilityStrip(days: readonly CalendarDay[], from: string, count: number): StripDay[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: StripDay[] = [];
  const [y, m, d] = from.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    const day = byDate.get(date);
    out.push({
      date,
      known: day !== undefined,
      available: day ? dayIsAvailable(day) : false,
      priceCents: day?.priceCents ?? null,
    });
  }
  return out;
}

/** Total pages for a result count. */
export function pageCount(total: number, pageSize = SEARCH_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
