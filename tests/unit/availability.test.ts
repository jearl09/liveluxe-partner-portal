import { describe, it, expect } from "vitest";
import { dayIsAvailable, nightsBetween, resolveAvailability, type CalendarDay } from "@/lib/domain/availability";

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

const limits = { minNights: 2, maxNights: null, maxGuests: 4, maxPets: 0 };
const stay = { checkIn: "2026-11-10", checkOut: "2026-11-14", adults: 2, children: 0, pets: 0 };
const fullRange = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map((d) => day(d));

describe("availability resolver (spec §6.4.2, §15.1)", () => {
  it("counts nights as calendar dates, never elapsed hours (DST-safe)", () => {
    expect(nightsBetween("2026-10-03", "2026-10-05")).toEqual(["2026-10-03", "2026-10-04"]); // AEDT starts 4 Oct 2026
    expect(nightsBetween("2026-11-14", "2026-11-10")).toEqual([]);
  });

  it("multi-unit allotment rule overrides the day status", () => {
    expect(dayIsAvailable({ isAvailable: false, allotment: 2, status: "reserved" })).toBe(true);
    expect(dayIsAvailable({ isAvailable: true, allotment: 0, status: "available" })).toBe(false);
    expect(dayIsAvailable({ isAvailable: true, allotment: null, status: "available" })).toBe(true);
    expect(dayIsAvailable({ isAvailable: true, allotment: null, status: "unknown" })).toBe(false);
  });

  it("is available when every rule passes", () => {
    const r = resolveAvailability(fullRange, limits, stay);
    expect(r.available).toBe(true);
    expect(r.quotable).toBe(true);
    expect(r.nights).toBe(4);
  });

  it("fails closed on a missing day", () => {
    const r = resolveAvailability(
      fullRange.filter((d) => d.date !== "2026-11-12"),
      limits,
      stay,
    );
    expect(r.available).toBe(false);
    expect(r.reason).toBe("gap");
    expect(r.missingDates).toEqual(["2026-11-12"]);
  });

  it("fails on an unavailable night and reports which", () => {
    const days = fullRange.map((d) =>
      d.date === "2026-11-11" ? day(d.date, { status: "reserved", isAvailable: false }) : d,
    );
    const r = resolveAvailability(days, limits, stay);
    expect(r.available).toBe(false);
    expect(r.reason).toBe("unavailable");
    expect(r.unavailableDates).toEqual(["2026-11-11"]);
  });

  it("enforces the maximum per-day minimum stay across the range", () => {
    const days = fullRange.map((d) => (d.date === "2026-11-12" ? day(d.date, { minStay: 7 }) : d));
    const r = resolveAvailability(days, limits, stay);
    expect(r.available).toBe(false);
    expect(r.reason).toBe("min_stay");
    expect(r.requiredMinStay).toBe(7);
  });

  it("respects closed-on-arrival and closed-on-departure", () => {
    const a = fullRange.map((d) => (d.date === "2026-11-10" ? day(d.date, { closedOnArrival: true }) : d));
    expect(resolveAvailability(a, limits, stay).reason).toBe("closed_on_arrival");
    const b = fullRange.map((d) => (d.date === "2026-11-14" ? day(d.date, { closedOnDeparture: true }) : d));
    expect(resolveAvailability(b, limits, stay).reason).toBe("closed_on_departure");
  });

  it("rejects over-capacity guests and pets", () => {
    expect(resolveAvailability(fullRange, limits, { ...stay, adults: 5 }).reason).toBe("capacity");
    expect(resolveAvailability(fullRange, limits, { ...stay, pets: 1 }).reason).toBe("capacity");
  });

  it("marks a stay non-quotable (price on application) when any night is unpriced, without hiding it", () => {
    const days = fullRange.map((d) => (d.date === "2026-11-13" ? day(d.date, { priceCents: null }) : d));
    const r = resolveAvailability(days, limits, stay);
    expect(r.available).toBe(true);
    expect(r.quotable).toBe(false);
    expect(r.unpricedDates).toEqual(["2026-11-13"]);
  });
});
