import { describe, expect, it } from "vitest";
import {
  approvalPaymentGate,
  authorisationAgeDays,
  creditCheck,
  invoiceDaysFor,
  invoiceItemsFromQuote,
  isAuthorisationStale,
  paymentKeys,
  paymentModeFor,
  paymentStateFromStripe,
  splitGuestName,
} from "@/lib/domain/payments";

describe("payment mode", () => {
  it("maps terms to a mode", () => {
    expect(paymentModeFor("prepay")).toBe("card_authorise");
    expect(paymentModeFor("deposit")).toBe("deposit");
    expect(paymentModeFor("net14")).toBe("invoice");
    expect(paymentModeFor("net30")).toBe("invoice");
    expect(paymentModeFor(null)).toBe("card_authorise");
    expect(invoiceDaysFor("net30")).toBe(30);
    expect(invoiceDaysFor("net14")).toBe(14);
    expect(invoiceDaysFor("prepay")).toBe(0);
  });
});

describe("creditCheck", () => {
  it("passes without a limit", () => {
    expect(creditCheck({ outstandingCents: 1, newCents: 1e9, limitCents: null })).toEqual({
      ok: true,
      remainingCents: null,
    });
  });
  it("blocks when the booking would exceed the limit", () => {
    expect(creditCheck({ outstandingCents: 60_000, newCents: 50_000, limitCents: 100_000 })).toEqual({
      ok: false,
      remainingCents: 40_000,
    });
    expect(creditCheck({ outstandingCents: 60_000, newCents: 40_000, limitCents: 100_000 }).ok).toBe(true);
  });
});

describe("paymentStateFromStripe", () => {
  it("maps PaymentIntent statuses", () => {
    expect(paymentStateFromStripe("requires_capture")).toBe("authorised");
    expect(paymentStateFromStripe("succeeded")).toBe("captured");
    expect(paymentStateFromStripe("canceled")).toBe("canceled");
    expect(paymentStateFromStripe("requires_action")).toBe("requires_action");
    expect(paymentStateFromStripe("requires_payment_method")).toBe("pending");
    expect(paymentStateFromStripe("requires_payment_method", "card_declined")).toBe("failed");
    expect(paymentStateFromStripe("processing")).toBe("pending");
  });
});

describe("approvalPaymentGate", () => {
  it("lets invoice partners through regardless of card state", () => {
    expect(approvalPaymentGate("invoice", null).ok).toBe(true);
  });
  it("requires a held or captured card otherwise", () => {
    expect(approvalPaymentGate("card_authorise", "authorised").ok).toBe(true);
    expect(approvalPaymentGate("card_authorise", "captured").ok).toBe(true);
    expect(approvalPaymentGate("card_authorise", null)).toMatchObject({ ok: false, reason: /not placed/ });
    expect(approvalPaymentGate("card_authorise", "failed")).toMatchObject({ ok: false, reason: /declined/ });
    expect(approvalPaymentGate("card_authorise", "requires_action")).toMatchObject({ ok: false, reason: /bank/ });
    expect(approvalPaymentGate("card_authorise", "pending").ok).toBe(false);
  });
});

describe("authorisation age", () => {
  const now = new Date("2026-10-13T10:00:00Z");
  it("counts whole days and flags at 5", () => {
    expect(authorisationAgeDays("2026-10-10T12:00:00Z", now)).toBe(2);
    expect(isAuthorisationStale("2026-10-10T12:00:00Z", now)).toBe(false);
    expect(isAuthorisationStale("2026-10-08T09:00:00Z", now)).toBe(true);
    expect(isAuthorisationStale("2026-10-11T09:00:00Z", now, 2)).toBe(true);
  });
});

describe("splitGuestName", () => {
  it("splits on the last space and copes with edge cases", () => {
    expect(splitGuestName("Mary Anne Smith")).toEqual({ first: "Mary Anne", last: "Smith" });
    expect(splitGuestName("Cher")).toEqual({ first: "Cher", last: "Cher" });
    expect(splitGuestName("  ")).toEqual({ first: "Guest", last: "Guest" });
    expect(splitGuestName(null)).toEqual({ first: "Guest", last: "Guest" });
  });
});

describe("invoiceItemsFromQuote", () => {
  it("keeps non-zero lines and appends GST", () => {
    const items = invoiceItemsFromQuote(
      [
        { kind: "accommodation", label: "7 nights", amountCents: 140000 },
        { kind: "discount", label: "Partner rate card (10%)", amountCents: -14000 },
        { kind: "fee", label: "Pet fee", amountCents: 0 },
      ] as never,
      12600,
    );
    expect(items).toEqual([
      { description: "7 nights", amountCents: 140000 },
      { description: "Partner rate card (10%)", amountCents: -14000 },
      { description: "GST", amountCents: 12600 },
    ]);
    expect(invoiceItemsFromQuote([], 0)).toEqual([]);
  });

  it("does not add GST again when the quote already has a tax line", () => {
    const items = invoiceItemsFromQuote(
      [
        { kind: "accommodation", label: "Accommodation (5 nights)", amountCents: 148900 },
        { kind: "cleaning_fee", label: "Cleaning fee", amountCents: 18100 },
        { kind: "tax", label: "GST (10%)", amountCents: 16700 },
      ] as never,
      16700,
    );
    expect(items.map((i) => i.amountCents).reduce((a, b) => a + b, 0)).toBe(183700);
    expect(items.filter((i) => /GST/.test(i.description))).toHaveLength(1);
  });
});

describe("paymentKeys", () => {
  it("are deterministic", () => {
    expect(paymentKeys.intent("b", "q", 1)).toBe("pi:b:q:1");
    expect(paymentKeys.intent("b", null, 2)).toBe("pi:b:none:2");
    expect(paymentKeys.capture("pi_1")).toBe("capture:pi_1");
    expect(paymentKeys.hostaway("b")).toBe("ha:b");
  });
});
