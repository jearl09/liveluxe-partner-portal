import { describe, expect, it } from "vitest";
import {
  cancellationQuote,
  clampRefund,
  DEFAULT_CANCELLATION_POLICY,
  parseCancellationPolicy,
  retentionPctFor,
} from "@/lib/domain/cancellation";

const tiered = parseCancellationPolicy(14, [
  { daysBefore: 14, retainPct: 0 },
  { daysBefore: 7, retainPct: 50 },
  { daysBefore: 0, retainPct: 100 },
]);

describe("parseCancellationPolicy", () => {
  it("falls back to defaults on garbage", () => {
    expect(parseCancellationPolicy("x", "nope")).toEqual(DEFAULT_CANCELLATION_POLICY);
    expect(parseCancellationPolicy(-3, [{ daysBefore: "a", retainPct: 5 }])).toEqual({ cutoffDays: 14, schedule: [] });
  });
  it("clamps percentages and floors days", () => {
    expect(parseCancellationPolicy("21", [{ daysBefore: 2.9, retainPct: 150 }])).toEqual({
      cutoffDays: 21,
      schedule: [{ daysBefore: 2, retainPct: 100 }],
    });
  });
});

describe("retentionPctFor", () => {
  it("with no schedule: free before the cut-off, nothing back after", () => {
    expect(retentionPctFor(14, DEFAULT_CANCELLATION_POLICY)).toBe(0);
    expect(retentionPctFor(13, DEFAULT_CANCELLATION_POLICY)).toBe(100);
    expect(retentionPctFor(-2, DEFAULT_CANCELLATION_POLICY)).toBe(100);
  });
  it("picks the tier by days before check-in", () => {
    expect(retentionPctFor(30, tiered)).toBe(0);
    expect(retentionPctFor(14, tiered)).toBe(0);
    expect(retentionPctFor(13, tiered)).toBe(50);
    expect(retentionPctFor(7, tiered)).toBe(50);
    expect(retentionPctFor(1, tiered)).toBe(100);
  });
  it("retains everything when no tier matches", () => {
    expect(retentionPctFor(3, { cutoffDays: 14, schedule: [{ daysBefore: 7, retainPct: 20 }] })).toBe(100);
  });
});

describe("cancellationQuote", () => {
  const base = { checkIn: "2026-11-25", totalCents: 183700, capturedCents: 183700, policy: tiered };

  it("withdrawals are always self-service and refund whatever was captured", () => {
    const q = cancellationQuote({ ...base, status: "UNDER_REVIEW", today: "2026-11-24", capturedCents: 0 });
    expect(q).toMatchObject({ kind: "withdraw", selfService: true, refundCents: 0, retainedCents: 0 });
  });

  it("confirmed + before cut-off: self-service, full refund", () => {
    const q = cancellationQuote({ ...base, status: "CONFIRMED", today: "2026-11-01" })!;
    expect(q.kind).toBe("cancel");
    expect(q.selfService).toBe(true);
    expect(q.daysUntilCheckIn).toBe(24);
    expect(q.retainPct).toBe(0);
    expect(q.refundCents).toBe(183700);
  });

  it("confirmed + inside cut-off: ops decision, partial retention", () => {
    const q = cancellationQuote({ ...base, status: "CONFIRMED", today: "2026-11-15" })!;
    expect(q.selfService).toBe(false);
    expect(q.daysUntilCheckIn).toBe(10);
    expect(q.retainPct).toBe(50);
    expect(q.retainedCents).toBe(91850);
    expect(q.refundCents).toBe(91850);
  });

  it("never refunds more than was captured (invoice mode captured nothing)", () => {
    const q = cancellationQuote({ ...base, status: "CONFIRMED", today: "2026-11-01", capturedCents: 0 })!;
    expect(q.refundCents).toBe(0);
    expect(q.retainedCents).toBe(0);
  });

  it("returns null for statuses that cannot be cancelled", () => {
    expect(cancellationQuote({ ...base, status: "DECLINED", today: "2026-11-01" })).toBeNull();
    expect(cancellationQuote({ ...base, status: "COMPLETED", today: "2026-11-01" })).toBeNull();
  });
});

describe("clampRefund", () => {
  it("bounds to [0, captured] and rounds", () => {
    expect(clampRefund(500.4, 1000)).toBe(500);
    expect(clampRefund(5000, 1000)).toBe(1000);
    expect(clampRefund(-1, 1000)).toBe(0);
    expect(clampRefund(Number.NaN, 1000)).toBe(0);
  });
});
