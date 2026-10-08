import { describe, it, expect } from "vitest";
import {
  buildAvailabilityStrip,
  pageCount,
  parseSearchParams,
  searchQueryString,
  summariseNightlyPrices,
} from "@/lib/domain/search";
import type { CalendarDay } from "@/lib/domain/availability";

const TODAY = "2026-10-08";

describe("parseSearchParams (spec §13.2)", () => {
  it("parses a full query", () => {
    const p = parseSearchParams(
      {
        q: "  Docklands ",
        checkIn: "2026-11-10",
        checkOut: "2026-11-14",
        guests: "3",
        pets: "1",
        bedrooms: "2",
        page: "2",
      },
      TODAY,
    );
    expect(p.errors).toEqual([]);
    expect(p.hasDates).toBe(true);
    expect(p.nights).toBe(4);
    expect(p.query).toEqual({
      q: "Docklands",
      checkIn: "2026-11-10",
      checkOut: "2026-11-14",
      guests: 3,
      pets: 1,
      bedrooms: 2,
      page: 2,
    });
  });

  it("defaults when nothing is given", () => {
    const p = parseSearchParams({}, TODAY);
    expect(p.hasDates).toBe(false);
    expect(p.query).toEqual({ q: "", checkIn: null, checkOut: null, guests: 1, pets: 0, bedrooms: null, page: 1 });
  });

  it("rejects reversed, past, too-long and half-entered dates but still renders", () => {
    expect(parseSearchParams({ checkIn: "2026-11-14", checkOut: "2026-11-10" }, TODAY).errors).toContain(
      "Check-out must be after check-in.",
    );
    expect(parseSearchParams({ checkIn: "2026-01-01", checkOut: "2026-01-05" }, TODAY).errors).toContain(
      "Check-in cannot be in the past.",
    );
    expect(parseSearchParams({ checkIn: "2026-11-01", checkOut: "2028-11-01" }, TODAY).errors[0]).toMatch(/400 nights/);
    const half = parseSearchParams({ checkIn: "2026-11-01" }, TODAY);
    expect(half.errors).toEqual(["Enter both a check-in and a check-out date."]);
    expect(half.hasDates).toBe(false);
    expect(parseSearchParams({ checkIn: "nope", checkOut: "2026-11-01" }, TODAY).errors[0]).toBe(
      "Check-in date is not valid.",
    );
  });

  it("clamps numbers and takes the first of repeated params", () => {
    const p = parseSearchParams({ guests: ["99", "2"], pets: "-3", bedrooms: "abc", page: "0" }, TODAY);
    expect(p.query.guests).toBe(20);
    expect(p.query.pets).toBe(0);
    expect(p.query.bedrooms).toBeNull();
    expect(p.query.page).toBe(1);
  });
});

describe("summariseNightlyPrices", () => {
  it("is quotable only when every night is priced", () => {
    const s = summariseNightlyPrices([{ priceCents: 30000 }, { priceCents: 35000 }], 2);
    expect(s).toEqual({
      quotable: true,
      accommodationCents: 65000,
      nightlyAverageCents: 32500,
      pricedNights: 2,
      nights: 2,
    });
    expect(summariseNightlyPrices([{ priceCents: 30000 }, { priceCents: null }], 2).quotable).toBe(false);
    expect(summariseNightlyPrices([{ priceCents: 30000 }], 2).quotable).toBe(false); // missing row
    expect(summariseNightlyPrices([], 0).nightlyAverageCents).toBe(0);
  });
});

describe("searchQueryString", () => {
  it("omits defaults so URLs stay short", () => {
    expect(searchQueryString({ q: "", guests: 1, pets: 0, page: 1 })).toBe("");
    expect(
      searchQueryString({ q: "Docklands", checkIn: "2026-11-10", checkOut: "2026-11-14", guests: 2, page: 3 }),
    ).toBe("?q=Docklands&checkIn=2026-11-10&checkOut=2026-11-14&guests=2&page=3");
  });
});

describe("buildAvailabilityStrip", () => {
  const day = (date: string, over: Partial<CalendarDay> = {}): CalendarDay => ({
    date,
    status: "available",
    isAvailable: true,
    allotment: null,
    priceCents: 30000,
    minStay: null,
    closedOnArrival: false,
    closedOnDeparture: false,
    ...over,
  });

  it("fills one cell per day and marks unsynced days as unknown", () => {
    const strip = buildAvailabilityStrip(
      [day("2026-10-08"), day("2026-10-09", { status: "reserved", isAvailable: false })],
      "2026-10-08",
      3,
    );
    expect(strip.map((d) => d.date)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(strip.map((d) => d.available)).toEqual([true, false, false]);
    expect(strip.map((d) => d.known)).toEqual([true, true, false]);
    expect(strip[0].priceCents).toBe(30000);
  });
});

describe("pageCount", () => {
  it("rounds up and never returns zero", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(24)).toBe(1);
    expect(pageCount(25)).toBe(2);
    expect(pageCount(7, 3)).toBe(3);
  });
});
