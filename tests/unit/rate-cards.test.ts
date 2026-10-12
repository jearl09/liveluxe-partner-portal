import { describe, expect, it } from "vitest";
import { describeRateCard, parseRateCardForm, rateCardFromRow } from "@/lib/domain/rate-cards";
import { escalationLabel, nextEscalationRung } from "@/lib/domain/requests";

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  version: 3,
  name: "NRMA 2026",
  discount_pct: "12.50",
  fixed_rates: { byListingId: { abc: 25000, bad: "x" }, byTag: {} },
  los_tiers: [
    { minNights: 90, discountPct: 5 },
    { minNights: "180", discountPct: 8 },
    { minNights: 0, discountPct: 3 },
    "junk",
  ],
  fee_overrides: { cleaningFeeFromNights: 28, waiveSecurityDeposit: true },
};

describe("rateCardFromRow", () => {
  it("maps the row and drops malformed entries", () => {
    const c = rateCardFromRow(row);
    expect(c.id).toBe(row.id);
    expect(c.version).toBe(3);
    expect(c.discountPct).toBe(12.5);
    expect(c.fixedNightlyCents).toEqual({ byListingId: { abc: 25000 } });
    expect(c.losTiers).toEqual([
      { minNights: 90, discountPct: 5 },
      { minNights: 180, discountPct: 8 },
    ]);
    expect(c.feeWaivers).toEqual({ cleaningFeeFromNights: 28, waiveSecurityDeposit: true });
  });

  it("leaves optional sections undefined when empty", () => {
    const c = rateCardFromRow({ ...row, fixed_rates: {}, los_tiers: [], fee_overrides: {} });
    expect(c.fixedNightlyCents).toBeUndefined();
    expect(c.losTiers).toBeUndefined();
    expect(c.feeWaivers).toBeUndefined();
  });

  it("clamps the percentage and tolerates garbage JSON", () => {
    const c = rateCardFromRow({ ...row, discount_pct: 140, fixed_rates: "nope", los_tiers: null, fee_overrides: 3 });
    expect(c.discountPct).toBe(100);
    expect(c.losTiers).toBeUndefined();
  });
});

describe("parseRateCardForm", () => {
  const today = "2026-10-12";
  it("accepts a complete form", () => {
    const r = parseRateCardForm(
      {
        name: "Suncorp standard",
        discountPct: "10",
        losTiers: "90:5\n180 : 8%\n\n",
        cleaningFeeFromNights: "28",
        waiveSecurityDeposit: "on",
        validFrom: "2026-11-01",
        validTo: "2027-06-30",
      },
      today,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual({
      name: "Suncorp standard",
      discountPct: 10,
      losTiers: [
        { minNights: 90, discountPct: 5 },
        { minNights: 180, discountPct: 8 },
      ],
      feeOverrides: { cleaningFeeFromNights: 28, waiveSecurityDeposit: true },
      validFrom: "2026-11-01",
      validTo: "2027-06-30",
    });
  });

  it("defaults the discount to 0 and allows an open end date", () => {
    const r = parseRateCardForm({ name: "Flat", validFrom: today }, today);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.discountPct).toBe(0);
      expect(r.values.validTo).toBeNull();
      expect(r.values.losTiers).toEqual([]);
    }
  });

  it("reports every problem field", () => {
    const r = parseRateCardForm(
      {
        name: "x",
        discountPct: "120",
        losTiers: "ninety:5\n90:5\n90:7",
        cleaningFeeFromNights: "1.5",
        validFrom: "2026-01-01",
        validTo: "2025-12-31",
      },
      today,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["cleaningFeeFromNights", "discountPct", "losTiers", "name", "validFrom", "validTo"].sort(),
    );
    expect(r.errors.losTiers).toHaveLength(2); // bad syntax + duplicate
  });
});

describe("describeRateCard", () => {
  it("summarises the card in words", () => {
    expect(describeRateCard(rateCardFromRow(row))).toBe(
      "12.5% off nightly · 2 length-of-stay tiers · cleaning fee waived from 28 nights · no security deposit · fixed nightly rates",
    );
    expect(describeRateCard({ id: "a", version: 1, discountPct: 0 })).toBe("No percentage discount");
  });
});

describe("nextEscalationRung", () => {
  const submitted = "2026-10-12T00:00:00.000Z";
  const due = "2026-10-12T04:00:00.000Z"; // 4 hour window
  const ladder = [50, 80, 100, 150];
  const at = (h: number) => new Date(Date.parse(submitted) + h * 3600_000);

  it("is silent before the first rung", () => {
    expect(nextEscalationRung(submitted, due, at(1), ladder, 0)).toBeNull();
  });
  it("fires each rung once, in order", () => {
    expect(nextEscalationRung(submitted, due, at(2), ladder, 0)).toBe(50);
    expect(nextEscalationRung(submitted, due, at(2), ladder, 50)).toBeNull();
    expect(nextEscalationRung(submitted, due, at(3.3), ladder, 50)).toBe(80);
    expect(nextEscalationRung(submitted, due, at(4), ladder, 80)).toBe(100);
    expect(nextEscalationRung(submitted, due, at(6), ladder, 100)).toBe(150);
    expect(nextEscalationRung(submitted, due, at(10), ladder, 150)).toBeNull();
  });
  it("jumps straight to the highest due rung after downtime", () => {
    expect(nextEscalationRung(submitted, due, at(7), ladder, 0)).toBe(150);
  });
  it("ignores paused, unsubmitted or inverted windows", () => {
    expect(nextEscalationRung(submitted, due, at(7), ladder, 0, { paused: true })).toBeNull();
    expect(nextEscalationRung(null, due, at(7), ladder, 0)).toBeNull();
    expect(nextEscalationRung(due, submitted, at(7), ladder, 0)).toBeNull();
  });
  it("labels rungs for ops", () => {
    expect(escalationLabel(50)).toMatch(/Halfway/);
    expect(escalationLabel(80)).toBe("SLA at risk");
    expect(escalationLabel(100)).toBe("SLA breached");
    expect(escalationLabel(150)).toMatch(/breached/);
  });
});
