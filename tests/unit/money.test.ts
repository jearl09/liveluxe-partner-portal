import { describe, it, expect } from "vitest";
import { applyPct, assertCents, formatMoney, sumCents } from "@/lib/domain/money";
import { DomainError, isDomainError } from "@/lib/domain/errors";
import { assertAvailable, type AvailabilityResult } from "@/lib/domain/availability";
import { findTransition } from "@/lib/domain/booking-state-machine";

describe("money helpers (spec §7.2, §9.3)", () => {
  it("rejects non-integer cents", () => {
    expect(() => assertCents(10.5)).toThrow(TypeError);
    expect(() => sumCents([100, 2.5])).toThrow(TypeError);
    expect(() => applyPct(99.9, 10)).toThrow(TypeError);
  });

  it("rounds percentages half-up at the line", () => {
    expect(applyPct(1_000, 12.5)).toBe(125);
    expect(applyPct(1_001, 12.5)).toBe(125); // 125.125 → 125
    expect(applyPct(1_004, 12.5)).toBe(126); // 125.5 → 126
  });

  it("formats with the currency code, en-AU style", () => {
    expect(formatMoney(916_920)).toBe("AUD $9,169.20");
    expect(formatMoney(0)).toBe("AUD $0.00");
  });
});

describe("availability → DomainError mapping", () => {
  const base: AvailabilityResult = {
    available: false,
    quotable: true,
    nights: 3,
    requiredMinStay: 7,
    missingDates: [],
    unavailableDates: [],
    unpricedDates: [],
  };
  const codeOf = (r: AvailabilityResult) => {
    try {
      assertAvailable(r, "L");
      return "none";
    } catch (e) {
      return isDomainError(e) ? e.code : "other";
    }
  };
  it("maps each reason to the §16.3 error code", () => {
    expect(codeOf({ ...base, available: true })).toBe("none");
    expect(codeOf({ ...base, reason: "capacity" })).toBe("CAPACITY_EXCEEDED");
    expect(codeOf({ ...base, reason: "min_stay" })).toBe("MIN_STAY_NOT_MET");
    expect(codeOf({ ...base, reason: "gap", missingDates: ["2026-11-12"] })).toBe("DATES_UNAVAILABLE");
    expect(codeOf({ ...base, reason: "closed_on_arrival" })).toBe("DATES_UNAVAILABLE");
  });
  it("carries http status and details on the error", () => {
    const e = new DomainError("DATES_HELD", { listingId: "L" });
    expect(e.http).toBe(409);
    expect(e.details).toEqual({ listingId: "L" });
    expect(isDomainError(new Error("x"))).toBe(false);
  });
});

describe("state machine lookups", () => {
  it("exposes side-effect descriptions for UI confirmation modals", () => {
    expect(findTransition("UNDER_REVIEW", "APPROVED")?.sideEffects).toMatch(/Live availability re-check/);
    expect(findTransition("DRAFT", "COMPLETED")).toBeUndefined();
  });
});
