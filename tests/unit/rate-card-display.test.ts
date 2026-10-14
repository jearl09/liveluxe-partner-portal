import { describe, expect, it } from "vitest";
import { rateCardSummary } from "@/lib/domain/rate-card-display";

describe("rateCardSummary (brief §6.6)", () => {
  it("reads in a few words", () => {
    expect(
      rateCardSummary({
        id: "x",
        version: 1,
        discountPct: 10,
        losTiers: [
          { minNights: 180, discountPct: 8 },
          { minNights: 90, discountPct: 5 },
        ],
        feeWaivers: { cleaningFeeFromNights: 28, waiveSecurityDeposit: true },
      }),
    ).toBe("10% off · 90n +5% · 180n +8% · cleaning waived from 28n · no bond");
    expect(rateCardSummary({ id: "x", version: 1, discountPct: 0 })).toBe("No discount");
    expect(rateCardSummary({ id: "x", version: 1, discountPct: 0, fixedNightlyCents: { byTag: { a: 1 } } })).toBe(
      "Fixed nightly rates",
    );
  });
});
