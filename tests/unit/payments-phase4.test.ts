import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/errors";
import {
  assertRefundable,
  balanceDueDate,
  balanceInvoiceItems,
  creditCheck,
  creditStandingFor,
  daysOverdue,
  declineReasonText,
  depositPctFor,
  depositSplit,
  dunningRung,
  earlyDepartureRefund,
  needsResumeReminder,
  parseDunningPolicy,
  parseOverLimitAction,
  paymentModeFor,
  submissionCreditDecision,
  usesCardHold,
  withinApprovalCeiling,
} from "@/lib/domain/payments";

describe("mode B — deposit now, balance on invoice (§11.1 B)", () => {
  it("picks the partner's percentage, else the platform default, clamped to 1–100", () => {
    expect(depositPctFor(null, 20)).toBe(20);
    expect(depositPctFor(35, 20)).toBe(35);
    expect(depositPctFor(null, "garbage")).toBe(20);
    expect(depositPctFor(250, 20)).toBe(100);
    expect(depositPctFor(0, 20)).toBe(1);
  });
  it("splits the total and never exceeds it", () => {
    expect(depositSplit(297_000, 20)).toEqual({ depositCents: 59_400, balanceCents: 237_600 });
    expect(depositSplit(100, 100)).toEqual({ depositCents: 100, balanceCents: 0 });
  });
  it("balance is due N days before check-in but never in the past and never same-day", () => {
    expect(balanceDueDate("2027-03-20", 14, "2026-10-13")).toBe("2027-03-06");
    expect(balanceDueDate("2026-10-20", 14, "2026-10-13")).toBe("2026-10-14");
    expect(balanceDueDate("2026-10-14", 14, "2026-10-13")).toBe("2026-10-14");
  });
  it("balance items are the stay less the deposit", () => {
    expect(balanceInvoiceItems([{ description: "Stay", amountCents: 1000 }], 200)).toEqual([
      { description: "Stay", amountCents: 1000 },
      { description: "Less deposit received", amountCents: -200 },
    ]);
  });
  it("mode mapping", () => {
    expect(paymentModeFor("deposit")).toBe("deposit");
    expect(usesCardHold("deposit")).toBe(true);
    expect(usesCardHold("invoice")).toBe(false);
  });
});

describe("§17.2 credit limit at submission", () => {
  const ok = creditCheck({ outstandingCents: 0, newCents: 1, limitCents: 10 });
  const over = creditCheck({ outstandingCents: 9, newCents: 5, limitCents: 10 });
  it("blocks or routes to finance per configuration; card partners are not gated by the limit", () => {
    expect(submissionCreditDecision({ mode: "invoice", check: over, action: "block", creditStanding: "good" })).toEqual(
      { outcome: "block", reason: "credit_limit" },
    );
    expect(
      submissionCreditDecision({ mode: "invoice", check: over, action: "finance_approval", creditStanding: "good" }),
    ).toEqual({ outcome: "finance_approval", reason: "credit_limit" });
    expect(submissionCreditDecision({ mode: "invoice", check: ok, action: "block", creditStanding: "good" })).toEqual({
      outcome: "ok",
    });
    expect(
      submissionCreditDecision({ mode: "card_authorise", check: over, action: "block", creditStanding: "good" }),
    ).toEqual({ outcome: "ok" });
  });
  it("credit standing from dunning overrides: finance approval, or suspended for everyone", () => {
    expect(
      submissionCreditDecision({
        mode: "card_authorise",
        check: ok,
        action: "block",
        creditStanding: "finance_approval",
      }),
    ).toEqual({ outcome: "finance_approval", reason: "credit_standing" });
    expect(
      submissionCreditDecision({ mode: "invoice", check: ok, action: "block", creditStanding: "finance_approval" }),
    ).toEqual({ outcome: "finance_approval", reason: "credit_standing" });
    expect(
      submissionCreditDecision({ mode: "invoice", check: ok, action: "block", creditStanding: "suspended" }),
    ).toEqual({ outcome: "block", reason: "credit_suspended" });
  });
  it("parses the configuration defensively", () => {
    expect(parseOverLimitAction("finance_approval")).toBe("finance_approval");
    expect(parseOverLimitAction("anything else")).toBe("block");
  });
  it("§10.5 value ceiling applies to ops only", () => {
    expect(withinApprovalCeiling({ role: "livluxe_ops", totalCents: 500, ceilingCents: 400 })).toBe(false);
    expect(withinApprovalCeiling({ role: "livluxe_ops", totalCents: 400, ceilingCents: 400 })).toBe(true);
    expect(withinApprovalCeiling({ role: "livluxe_finance", totalCents: 5_000_000, ceilingCents: 400 })).toBe(true);
    expect(withinApprovalCeiling({ role: "livluxe_ops", totalCents: null, ceilingCents: null })).toBe(true);
  });
});

describe("§17.2 refunds", () => {
  it("rejects above the remaining refundable amount with the maximum, and while frozen", () => {
    expect(
      assertRefundable({ requestedCents: 500, capturedCents: 1000, alreadyRefundedCents: 400, refundsFrozen: false }),
    ).toEqual({ maxRefundableCents: 600 });
    expect(() =>
      assertRefundable({ requestedCents: 601, capturedCents: 1000, alreadyRefundedCents: 400, refundsFrozen: false }),
    ).toThrowError(
      expect.objectContaining({
        code: "REFUND_EXCEEDS_CAPTURED",
        details: expect.objectContaining({ maxRefundableCents: 600 }),
      }),
    );
    expect(() =>
      assertRefundable({ requestedCents: 1, capturedCents: 1000, alreadyRefundedCents: 0, refundsFrozen: true }),
    ).toThrowError(expect.objectContaining({ code: "REFUNDS_FROZEN" }));
    expect(() =>
      assertRefundable({ requestedCents: -1, capturedCents: 1000, alreadyRefundedCents: 0, refundsFrozen: false }),
    ).toThrow(DomainError);
    expect(() =>
      assertRefundable({
        requestedCents: Number.NaN,
        capturedCents: 1000,
        alreadyRefundedCents: 0,
        refundsFrozen: false,
      }),
    ).toThrow(DomainError);
  });
  it("early departure refunds the unused nights pro rata less the policy retention", () => {
    expect(
      earlyDepartureRefund({
        totalCents: 100_000,
        nights: 10,
        oldCheckOut: "2026-11-20",
        newCheckOut: "2026-11-16",
        retainPct: 25,
      }),
    ).toEqual({
      unusedNights: 4,
      unusedCents: 40_000,
      retainedCents: 10_000,
      refundCents: 30_000,
    });
    expect(
      earlyDepartureRefund({
        totalCents: 100_000,
        nights: 0,
        oldCheckOut: "2026-11-20",
        newCheckOut: "2026-11-25",
        retainPct: 0,
      }).unusedNights,
    ).toBe(0);
  });
});

describe("§17.2 card declines and abandoned flows", () => {
  it("translates decline codes to plain language with a safe default", () => {
    expect(declineReasonText("insufficient_funds")).toMatch(/insufficient funds/);
    expect(declineReasonText("expired_card")).toMatch(/expired/);
    expect(declineReasonText("weird_new_code")).toBe("The card could not be authorised.");
    expect(declineReasonText(null)).toBe("The card could not be authorised.");
  });
  it("reminds once, only for incomplete states, only after the window", () => {
    const now = new Date("2026-10-13T10:00:00Z");
    const base = { reminderSentAtIso: null, now, reminderMinutes: 60 };
    expect(needsResumeReminder({ ...base, state: "requires_action", updatedAtIso: "2026-10-13T08:00:00Z" })).toBe(true);
    expect(needsResumeReminder({ ...base, state: "requires_action", updatedAtIso: "2026-10-13T09:30:00Z" })).toBe(
      false,
    );
    expect(needsResumeReminder({ ...base, state: "authorised", updatedAtIso: "2026-10-13T08:00:00Z" })).toBe(false);
    expect(
      needsResumeReminder({
        ...base,
        state: "failed",
        updatedAtIso: "2026-10-13T08:00:00Z",
        reminderSentAtIso: "2026-10-13T09:00:00Z",
      }),
    ).toBe(false);
  });
});

describe("§17.2 dunning", () => {
  const policy = parseDunningPolicy([1, 7, 14], 14, 30);
  it("parses the three settings with defaults for garbage", () => {
    expect(policy).toEqual({ reminderDays: [1, 7, 14], financeApprovalAfterDays: 14, suspendAfterDays: 30 });
    expect(parseDunningPolicy("x", "y", "z")).toEqual({
      reminderDays: [1, 7, 14],
      financeApprovalAfterDays: 14,
      suspendAfterDays: 30,
    });
    expect(parseDunningPolicy([14, 1, "bad"], 10, 20).reminderDays).toEqual([1, 14]);
  });
  it("rungs are the highest reminder day reached; standing follows the thresholds", () => {
    expect(dunningRung(0, policy)).toBe(0);
    expect(dunningRung(1, policy)).toBe(1);
    expect(dunningRung(9, policy)).toBe(2);
    expect(dunningRung(40, policy)).toBe(3);
    expect(creditStandingFor(null, policy)).toBe("good");
    expect(creditStandingFor(0, policy)).toBe("good");
    expect(creditStandingFor(3, policy)).toBe("watch");
    expect(creditStandingFor(14, policy)).toBe("finance_approval");
    expect(creditStandingFor(30, policy)).toBe("suspended");
    expect(daysOverdue("2026-10-01T00:00:00Z", new Date("2026-10-13T12:00:00Z"))).toBe(12);
  });
});
