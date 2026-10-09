import { describe, it, expect } from "vitest";
import {
  addBusinessHours,
  applyOpsAdjustment,
  guestsSummary,
  requestBucket,
  slaBand,
  validateCounterOffer,
  validateRequestForm,
} from "@/lib/domain/requests";
import { buildQuote, PLACEHOLDER_TAX_RULES } from "@/lib/domain/quote-engine";

const BH = { start: "08:00", end: "18:00", timezone: "Australia/Melbourne" };

describe("addBusinessHours (spec §11.1)", () => {
  // Melbourne is UTC+11 (AEDT) in October–March.
  it("adds within the same business day", () => {
    // 10:00 Melbourne Tue 13 Oct 2026 = 23:00Z Mon 12 Oct
    expect(addBusinessHours("2026-10-12T23:00:00Z", 4, BH)).toBe("2026-10-13T03:00:00.000Z"); // 14:00 local
  });

  it("rolls past closing time to the next morning", () => {
    // 16:00 local Tue + 4 h → 2 h today, 2 h tomorrow → 10:00 Wed = 23:00Z Tue
    expect(addBusinessHours("2026-10-13T05:00:00Z", 4, BH)).toBe("2026-10-13T23:00:00.000Z");
  });

  it("skips the weekend", () => {
    // 17:00 local Fri 16 Oct + 4 h → 1 h Fri, 3 h Mon → 11:00 Mon 19 Oct = 00:00Z Mon
    expect(addBusinessHours("2026-10-16T06:00:00Z", 4, BH)).toBe("2026-10-19T00:00:00.000Z");
  });

  it("starts the clock at opening time when raised overnight", () => {
    // 02:00 local Wed → clock starts 08:00 → +2 h = 10:00 local = 23:00Z Tue
    expect(addBusinessHours("2026-10-13T15:00:00Z", 2, BH)).toBe("2026-10-13T23:00:00.000Z");
  });

  it("supports fractional hours", () => {
    expect(addBusinessHours("2026-10-12T23:00:00Z", 1.5, BH)).toBe("2026-10-13T00:30:00.000Z");
  });
});

describe("slaBand (§13.4)", () => {
  const submitted = "2026-10-13T00:00:00Z";
  const due = "2026-10-13T04:00:00Z";
  it("bands by elapsed percentage", () => {
    expect(slaBand(submitted, due, new Date("2026-10-13T01:00:00Z"))).toBe("on_track");
    expect(slaBand(submitted, due, new Date("2026-10-13T03:30:00Z"))).toBe("at_risk");
    expect(slaBand(submitted, due, new Date("2026-10-13T04:00:00Z"))).toBe("breached");
    expect(slaBand(submitted, due, new Date("2026-10-13T01:00:00Z"), { paused: true })).toBe("paused");
    expect(slaBand(null, due, new Date())).toBe("none");
  });
});

describe("validateRequestForm (§7.1)", () => {
  it("enforces org rules and the terms checkbox", () => {
    const r = validateRequestForm(
      { guestName: "J", guestEmail: "nope", acceptTerms: "" },
      { requireClaimRef: true, requirePoNumber: false },
    );
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(["acceptTerms", "claimRef", "guestEmail", "guestName"]);
  });

  it("accepts a complete form and trims", () => {
    const r = validateRequestForm(
      { guestName: "  Jane Citizen ", guestEmail: "", claimRef: "CLM-1", acceptTerms: "on", notes: "x" },
      { requireClaimRef: true, requirePoNumber: false },
    );
    expect(r.ok).toBe(true);
    expect(r.values.guestName).toBe("Jane Citizen");
    expect(r.values.acceptTerms).toBe(true);
  });
});

describe("guestsSummary / requestBucket", () => {
  it("formats guests", () => {
    expect(guestsSummary(2, 1, 0)).toBe("2 adults, 1 child");
    expect(guestsSummary(1, 0, 2)).toBe("1 adult, 2 pets");
  });
  it("buckets statuses", () => {
    expect(requestBucket("SUBMITTED")).toBe("open");
    expect(requestBucket("CONFIRMED")).toBe("upcoming");
    expect(requestBucket("DECLINED")).toBe("history");
  });
});

describe("counter-offers", () => {
  const current = { totalCents: 100000, checkIn: "2026-11-10", checkOut: "2026-11-14" };

  it("requires a real change and a message", () => {
    expect(validateCounterOffer({}, current).errors).toContain(
      "A counter-offer needs a different price or different dates.",
    );
    expect(validateCounterOffer({ newTotal: "1,000.00", message: "" }, current).errors).toContain(
      "Tell the partner why you are proposing this.",
    );
    const ok = validateCounterOffer({ newTotal: "$950.50", message: "Weekend rate" }, current);
    expect(ok.ok).toBe(true);
    expect(ok.value).toEqual({ newTotalCents: 95050, newCheckIn: null, newCheckOut: null, message: "Weekend rate" });
  });

  it("validates new dates", () => {
    expect(validateCounterOffer({ newCheckIn: "2026-11-12", message: "x" }, current).errors).toContain(
      "Enter both new dates or neither.",
    );
    const ok = validateCounterOffer(
      { newCheckIn: "2026-11-12", newCheckOut: "2026-11-16", message: "Shift by two days" },
      current,
    );
    expect(ok.ok).toBe(true);
    expect(ok.value.newCheckIn).toBe("2026-11-12");
  });

  it("applies an ops adjustment keeping sum(lines) === total and a fresh hash", () => {
    const ctx = { listingId: "l1", checkIn: "2026-11-10", checkOut: "2026-11-12", adults: 2, children: 0, pets: 0 };
    const quote = buildQuote({
      ...ctx,
      nightlyPricesCents: [30000, 30000],
      listing: {
        cleaningFeeCents: 10000,
        extraPersonFeeCents: 0,
        guestsIncluded: 2,
        securityDepositCents: 0,
        weeklyDiscountPct: 0,
        monthlyDiscountPct: 0,
      },
      rateCard: null,
      policy: { midStayClean: null, taxRules: PLACEHOLDER_TAX_RULES },
    });
    const adjusted = applyOpsAdjustment(quote, ctx, 70000);
    expect(adjusted.totalCents).toBe(70000);
    expect(adjusted.lines.reduce((a, l) => a + l.amountCents, 0)).toBe(70000);
    expect(adjusted.lines.at(-1)?.kind).toBe("adjustment");
    expect(adjusted.priceHash).not.toBe(quote.priceHash);
    expect(applyOpsAdjustment(quote, ctx, quote.totalCents)).toBe(quote);
  });
});
