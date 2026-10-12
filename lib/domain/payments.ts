/**
 * Payment rules — spec §11.1 (payment modes), §11.4 (authorisation expiry), §11.5
 * (invoice composition). Pure: no Stripe, no database. The Stripe object states
 * are mapped to a small local vocabulary so screens never branch on raw strings.
 */
import type { QuoteLine } from "./quote-engine";

export type PaymentTerms = "prepay" | "deposit" | "net14" | "net30";

/**
 * How a booking is paid. Mode B (deposit now, balance on invoice) needs Angel's
 * deposit % decision (docs/DECISIONS-REQUIRED.md); until then 'deposit' partners
 * are treated as mode A so nothing is charged twice.
 */
export type PaymentMode = "card_authorise" | "invoice";

export function paymentModeFor(terms: PaymentTerms | null | undefined): PaymentMode {
  return terms === "net14" || terms === "net30" ? "invoice" : "card_authorise";
}

export function invoiceDaysFor(terms: PaymentTerms | null | undefined): number {
  return terms === "net30" ? 30 : terms === "net14" ? 14 : 0;
}

/** Statuses in which the partner may place a card hold or pay. */
export const PAYABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "AWAITING_PAYMENT"] as const;

export const PAYMENT_TERMS: readonly PaymentTerms[] = ["prepay", "deposit", "net14", "net30"];

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  prepay: "Card: hold at request, charge on approval",
  deposit: "Card: deposit on approval, balance invoiced (pending decision; charged as prepay for now)",
  net14: "Invoice: net 14 days",
  net30: "Invoice: net 30 days",
};

/** Mode C gate (§11.1): outstanding invoices plus this booking must fit the credit limit. */
export function creditCheck(args: { outstandingCents: number; newCents: number; limitCents: number | null }): {
  ok: boolean;
  remainingCents: number | null;
} {
  if (args.limitCents == null) return { ok: true, remainingCents: null };
  const remaining = args.limitCents - args.outstandingCents;
  return { ok: args.newCents <= remaining, remainingCents: remaining };
}

/** Local vocabulary for a PaymentIntent (§11.3). */
export type PaymentState = "pending" | "requires_action" | "authorised" | "captured" | "failed" | "canceled";

export function paymentStateFromStripe(status: string, lastErrorCode?: string | null): PaymentState {
  switch (status) {
    case "requires_capture":
      return "authorised";
    case "succeeded":
      return "captured";
    case "canceled":
      return "canceled";
    case "requires_action":
      return "requires_action";
    case "requires_payment_method":
      return lastErrorCode ? "failed" : "pending";
    default:
      return "pending";
  }
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  pending: "Card details not completed",
  requires_action: "Bank authentication outstanding",
  authorised: "Card held (not charged)",
  captured: "Paid",
  failed: "Card declined",
  canceled: "Hold released",
};

/** True when ops may approve: the card is held, or the partner pays by invoice. */
export function approvalPaymentGate(mode: PaymentMode, state: PaymentState | null): { ok: boolean; reason?: string } {
  if (mode === "invoice") return { ok: true };
  if (state === "authorised" || state === "captured") return { ok: true };
  return {
    ok: false,
    reason:
      state === "requires_action"
        ? "The partner's bank is still asking them to authenticate the card."
        : state === "failed"
          ? "The partner's card was declined. Ask them to try another card."
          : "The partner has not placed a card hold yet.",
  };
}

/** §11.4: never let an authorisation lapse silently. Card networks release after ~7 days. */
export function authorisationAgeDays(authorisedAtIso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(authorisedAtIso)) / 86_400_000);
}

export function isAuthorisationStale(authorisedAtIso: string, now: Date, thresholdDays = 5): boolean {
  return authorisationAgeDays(authorisedAtIso, now) >= thresholdDays;
}

/** Hostaway wants first/last; partners type one field. */
export function splitGuestName(name: string | null | undefined): { first: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Guest", last: "Guest" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export interface InvoiceItem {
  description: string;
  amountCents: number;
}

/**
 * §11.5: one invoice line per quote line (accommodation, discounts as negatives,
 * fees), then GST as its own line. Zero-amount lines are dropped.
 */
export function invoiceItemsFromQuote(lines: QuoteLine[], taxCents: number): InvoiceItem[] {
  const items = lines
    .filter((l) => l.amountCents !== 0)
    .map((l) => ({ description: l.label, amountCents: Math.round(l.amountCents) }));
  if (taxCents > 0) items.push({ description: "GST", amountCents: Math.round(taxCents) });
  return items;
}

/** Idempotency keys are derived, never random: a retried job must hit the same Stripe object. */
export const paymentKeys = {
  intent: (bookingId: string, quoteId: string | null, attempt: number) =>
    `pi:${bookingId}:${quoteId ?? "none"}:${attempt}`,
  capture: (paymentIntentId: string) => `capture:${paymentIntentId}`,
  cancel: (paymentIntentId: string) => `cancel:${paymentIntentId}`,
  invoice: (bookingId: string) => `inv:${bookingId}`,
  hostaway: (bookingId: string) => `ha:${bookingId}`,
};
