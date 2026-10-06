import { describe, it, expect } from "vitest";
import { buildQuote, layerLos, layerRateCard, priceChangeDecision, type QuoteInputs } from "@/lib/domain/quote-engine";
import { DomainError } from "@/lib/domain/errors";

/** Spec §9.2 worked example: 35 nights, 25 weekdays @ $310 + 10 weekend nights @ $360. */
function workedExampleInputs(): QuoteInputs {
  const prices: number[] = [];
  for (let i = 0; i < 25; i++) prices.push(31000);
  for (let i = 0; i < 10; i++) prices.push(36000);
  return {
    listingId: "11111111-1111-1111-1111-111111111111",
    checkIn: "2026-11-01",
    checkOut: "2026-12-06",
    adults: 2,
    children: 0,
    pets: 0,
    nightlyPricesCents: prices,
    listing: {
      cleaningFeeCents: 25000,
      extraPersonFeeCents: 5000,
      guestsIncluded: 4,
      securityDepositCents: 100000,
      weeklyDiscountPct: 5,
      monthlyDiscountPct: 10,
    },
    rateCard: { id: "rc-1", version: 1, discountPct: 12, feeWaivers: { cleaningFeeFromNights: 28 } },
    policy: { midStayClean: { fromNights: 28, everyNights: 28, feeCents: 18000 }, taxRules: [] },
  };
}

describe("quote engine (spec §9)", () => {
  it("reproduces the §9.2 worked example line by line", () => {
    const q = buildQuote(workedExampleInputs());
    const by = (kind: string) => q.lines.find((l) => l.kind === kind)?.amountCents;

    expect(by("accommodation")).toBe(1_135_000); // $11,350.00
    expect(by("los_discount")).toBe(-113_500); // −$1,135.00 (monthly 10%)
    expect(by("partner_discount")).toBe(-122_580); // −$1,225.80 (12% of post-LOS)
    expect(by("cleaning_fee")).toBeUndefined(); // waived ≥ 28 nights
    expect(by("mid_stay_clean")).toBe(18_000); // 1 × $180
    expect(by("extra_guest_fee")).toBeUndefined(); // 2 guests ≤ 4 included
    expect(q.subtotalCents).toBe(916_920); // $9,169.20
    expect(q.securityDepositCents).toBe(100_000);
  });

  it("invariant: sum of lines equals total, in integer cents", () => {
    const input = workedExampleInputs();
    input.policy.taxRules = [{ label: "GST (10%)", minNights: 1, ratePct: 10 }];
    const q = buildQuote(input);
    const sum = q.lines.reduce((a, l) => a + l.amountCents, 0);
    expect(sum).toBe(q.totalCents);
    expect(Number.isInteger(q.totalCents)).toBe(true);
    expect(q.taxCents).toBe(Math.round(916_920 * 0.1));
  });

  it("is deterministic: same inputs → same priceHash; any change → different hash", () => {
    const a = buildQuote(workedExampleInputs());
    const b = buildQuote(workedExampleInputs());
    expect(a.priceHash).toBe(b.priceHash);
    const c = buildQuote({ ...workedExampleInputs(), adults: 3 });
    expect(c.priceHash).not.toBe(a.priceHash);
  });

  it("refuses to quote when any night has a null price (price on application)", () => {
    const input = workedExampleInputs();
    (input.nightlyPricesCents as (number | null)[])[3] = null;
    expect(() => buildQuote(input)).toThrowError(DomainError);
  });

  it("applies the best single LOS tier, including rate-card tiers", () => {
    expect(layerLos(100_000, 6, 5, 10)).toEqual({ pct: 0, discountCents: 0 });
    expect(layerLos(100_000, 7, 5, 10)).toEqual({ pct: 5, discountCents: -5_000 });
    expect(layerLos(100_000, 28, 5, 10)).toEqual({ pct: 10, discountCents: -10_000 });
    expect(layerLos(100_000, 90, 5, 10, [{ minNights: 90, discountPct: 15 }])).toEqual({
      pct: 15,
      discountCents: -15_000,
    });
  });

  it("fixed nightly override wins over percentage", () => {
    const card = { id: "rc", version: 1, discountPct: 12, fixedNightlyCents: { byListingId: { L1: 25_000 } } };
    expect(layerRateCard(300_000, 10, card, "L1")).toEqual({ discountCents: -50_000, mode: "fixed" });
    expect(layerRateCard(300_000, 10, card, "L2")).toEqual({ discountCents: -36_000, mode: "percentage" });
  });

  it("charges extra guests and pets only above the included allowance", () => {
    const input = workedExampleInputs();
    input.adults = 5; // 1 over the 4 included, 35 nights × $50
    input.pets = 1;
    input.listing.petFeeCents = 15_000;
    const q = buildQuote(input);
    expect(q.lines.find((l) => l.kind === "extra_guest_fee")?.amountCents).toBe(35 * 5_000);
    expect(q.lines.find((l) => l.kind === "pet_fee")?.amountCents).toBe(15_000);
  });

  it("§9.3 expired-quote handling: unchanged → honour; < 2% → absorb; ≥ 2% → acceptance", () => {
    expect(priceChangeDecision(100_000, 100_000)).toBe("honour_unchanged");
    expect(priceChangeDecision(100_000, 101_500)).toBe("honour_absorb_variance");
    expect(priceChangeDecision(100_000, 108_000)).toBe("require_acceptance");
  });
});
