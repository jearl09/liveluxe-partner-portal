/**
 * Payment rules — spec §11.1 (payment modes), §11.3 (webhook vocabulary), §11.4
 * (authorisation expiry), §11.5 (invoice composition), §17.2 (failure modes).
 * Pure: no Stripe, no database. The Stripe object states are mapped to a small
 * local vocabulary so screens never branch on raw strings.
 */
import { addDays, daysBetween } from "./dates";
import { DomainError } from "./errors";
import type { QuoteLine } from "./quote-engine";

export type PaymentTerms = "prepay" | "deposit" | "net14" | "net30";

/**
 * How a booking is paid (§11.1).
 *   card_authorise  mode A: hold at request, capture the full amount on approval
 *   deposit         mode B: hold at request, capture the deposit on approval, balance invoiced before check-in
 *   invoice         mode C: no card; net-terms invoice on approval, gated by the credit limit
 */
export type PaymentMode = "card_authorise" | "deposit" | "invoice";

export function paymentModeFor(terms: PaymentTerms | null | undefined): PaymentMode {
  if (terms === "net14" || terms === "net30") return "invoice";
  if (terms === "deposit") return "deposit";
  return "card_authorise";
}

/** Modes that start with a card hold at request time (A and B). */
export const usesCardHold = (mode: PaymentMode): boolean => mode !== "invoice";

export function invoiceDaysFor(terms: PaymentTerms | null | undefined): number {
  return terms === "net30" ? 30 : terms === "net14" ? 14 : 0;
}

/** Statuses in which the partner may place a card hold or pay. */
export const PAYABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "AWAITING_PAYMENT"] as const;

export const PAYMENT_TERMS: readonly PaymentTerms[] = ["prepay", "deposit", "net14", "net30"];

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  prepay: "Card: hold at request, charge on approval",
  deposit: "Card: deposit charged on approval, balance invoiced before check-in",
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

export type OverLimitAction = "block" | "finance_approval";

export function parseOverLimitAction(value: unknown): OverLimitAction {
  return value === "finance_approval" ? "finance_approval" : "block";
}

/**
 * §17.2 "Partner exceeds credit limit": at submission the booking is blocked or
 * routed to finance approval per configuration. Also applies while the org's
 * credit standing (dunning) demands finance approval, and blocks a suspended org.
 */
export function submissionCreditDecision(args: {
  mode: PaymentMode;
  check: ReturnType<typeof creditCheck>;
  action: OverLimitAction;
  creditStanding: "good" | "watch" | "finance_approval" | "suspended";
}): { outcome: "ok" | "finance_approval" | "block"; reason?: string } {
  if (args.creditStanding === "suspended") return { outcome: "block", reason: "credit_suspended" };
  const needsFinance = args.creditStanding === "finance_approval";
  if (args.mode !== "invoice")
    return needsFinance ? { outcome: "finance_approval", reason: "credit_standing" } : { outcome: "ok" };
  if (!args.check.ok) {
    return args.action === "finance_approval"
      ? { outcome: "finance_approval", reason: "credit_limit" }
      : { outcome: "block", reason: "credit_limit" };
  }
  return needsFinance ? { outcome: "finance_approval", reason: "credit_standing" } : { outcome: "ok" };
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

/** §10.5 value ceiling: ops may approve up to a configurable total; above it finance must. */
export function withinApprovalCeiling(args: {
  role: string;
  totalCents: number | null;
  ceilingCents: number | null;
}): boolean {
  if (args.ceilingCents == null || args.role !== "livluxe_ops") return true;
  return (args.totalCents ?? 0) <= args.ceilingCents;
}

/** §11.4: never let an authorisation lapse silently. Card networks release after ~7 days. */
export function authorisationAgeDays(authorisedAtIso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(authorisedAtIso)) / 86_400_000);
}

export function isAuthorisationStale(authorisedAtIso: string, now: Date, thresholdDays = 5): boolean {
  return authorisationAgeDays(authorisedAtIso, now) >= thresholdDays;
}

/**
 * §17.2 "3DS challenge abandoned mid-flow": a PaymentIntent that has sat in
 * requires_action / requires_payment_method for longer than the reminder window
 * earns one resume-link email.
 */
export function needsResumeReminder(args: {
  state: PaymentState;
  updatedAtIso: string;
  reminderSentAtIso: string | null;
  now: Date;
  reminderMinutes: number;
}): boolean {
  if (args.reminderSentAtIso) return false;
  if (args.state !== "requires_action" && args.state !== "pending" && args.state !== "failed") return false;
  return args.now.getTime() - Date.parse(args.updatedAtIso) >= args.reminderMinutes * 60_000;
}

/** Plain-language decline reasons for the partner (§17.2 "Card authorisation fails"). */
const DECLINE_TEXT: Record<string, string> = {
  insufficient_funds: "The card was declined for insufficient funds.",
  card_declined: "The card was declined by the issuing bank.",
  generic_decline: "The card was declined by the issuing bank.",
  do_not_honor: "The issuing bank did not authorise this payment.",
  expired_card: "The card has expired.",
  incorrect_cvc: "The security code (CVC) did not match.",
  incorrect_number: "The card number was not valid.",
  invalid_expiry_month: "The expiry date was not valid.",
  invalid_expiry_year: "The expiry date was not valid.",
  processing_error: "The bank reported a processing error.",
  lost_card: "The card was reported lost.",
  stolen_card: "The card was reported stolen.",
  fraudulent: "The bank flagged this payment and did not authorise it.",
  authentication_required: "The bank asked for extra authentication which was not completed.",
  card_velocity_exceeded: "The card has exceeded its spending limit for the period.",
  withdrawal_count_limit_exceeded: "The card has exceeded its transaction limit.",
  currency_not_supported: "The card does not support payments in this currency.",
  call_issuer: "The issuing bank asked to be contacted before authorising.",
  pickup_card: "The issuing bank asked for the card to be retained.",
};

export function declineReasonText(code: string | null | undefined): string {
  if (!code) return "The card could not be authorised.";
  return DECLINE_TEXT[code] ?? "The card could not be authorised.";
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
 * fees), then GST as its own line. Zero-amount lines are dropped. The quote
 * engine already emits a `tax` line; GST is appended from `taxCents` only when
 * the quote carries no tax line, so it is never counted twice.
 */
export function invoiceItemsFromQuote(lines: QuoteLine[], taxCents: number): InvoiceItem[] {
  const items = lines
    .filter((l) => l.amountCents !== 0)
    .map((l) => ({ description: l.label, amountCents: Math.round(l.amountCents) }));
  const hasTaxLine = lines.some((l) => l.kind === "tax" && l.amountCents !== 0);
  if (!hasTaxLine && taxCents > 0) items.push({ description: "GST", amountCents: Math.round(taxCents) });
  return items;
}

// ---------------------------------------------------------------------------
// Mode B — deposit now, balance on invoice (§11.1 B, §11.3 invoice.paid)
// ---------------------------------------------------------------------------

/** Deposit percentage: the partner's own figure, else the platform default. Clamped to 1–100. */
export function depositPctFor(orgPct: number | null | undefined, defaultPct: unknown): number {
  const pick = orgPct != null && Number.isFinite(orgPct) ? orgPct : Number(defaultPct);
  if (!Number.isFinite(pick)) return 20;
  return Math.min(100, Math.max(1, pick));
}

/** Split a total into the deposit captured at approval and the balance invoiced later. */
export function depositSplit(totalCents: number, pct: number): { depositCents: number; balanceCents: number } {
  const depositCents = Math.min(totalCents, Math.max(0, Math.round((totalCents * pct) / 100)));
  return { depositCents, balanceCents: totalCents - depositCents };
}

/**
 * When the balance invoice falls due: `daysBefore` days ahead of check-in, but never
 * in the past and never less than one day from issue — a stay starting next week
 * is invoiced "due tomorrow", not "due last month". Returns an ISO date (UTC midnight).
 */
export function balanceDueDate(checkIn: string, daysBefore: number, today: string): string {
  const target = addDays(checkIn, -Math.max(0, Math.floor(daysBefore)));
  const earliest = addDays(today, 1);
  return daysBetween(earliest, target) >= 0 ? target : earliest;
}

/**
 * Mode C: days until a net-terms invoice falls due. The partner's terms (net 14 / net 30), but never later than
 * `daysBefore` days ahead of check-in (settings `invoice.due_days_before_checkin`); a stay starting soon is due
 * tomorrow. Null `daysBefore` means terms only.
 */
export function invoiceDaysUntilDue(
  terms: PaymentTerms | null | undefined,
  checkIn: string,
  daysBefore: number | null,
  today: string,
): number {
  const termDays = invoiceDaysFor(terms);
  if (daysBefore == null) return termDays;
  const byCheckIn = daysBetween(today, balanceDueDate(checkIn, daysBefore, today));
  return termDays > 0 ? Math.min(termDays, byCheckIn) : byCheckIn;
}

/** Invoice line items for the balance: the stay less the deposit already taken. */
export function balanceInvoiceItems(stayItems: InvoiceItem[], depositCents: number): InvoiceItem[] {
  return [...stayItems, { description: "Less deposit received", amountCents: -depositCents }];
}

// ---------------------------------------------------------------------------
// Refunds (§17.2 "Partial refund needed", "Refund exceeds captured amount", "Chargeback raised")
// ---------------------------------------------------------------------------

/**
 * Server-side validation before a refund reaches Stripe. Rejects an amount above
 * what remains refundable with a specific error carrying the maximum, and refuses
 * any automated refund while a dispute has the booking frozen.
 */
export function assertRefundable(args: {
  requestedCents: number;
  capturedCents: number;
  alreadyRefundedCents: number;
  refundsFrozen: boolean;
}): { maxRefundableCents: number } {
  const maxRefundableCents = Math.max(0, args.capturedCents - args.alreadyRefundedCents);
  if (args.refundsFrozen) throw new DomainError("REFUNDS_FROZEN", { maxRefundableCents });
  if (!Number.isFinite(args.requestedCents) || args.requestedCents < 0)
    throw new DomainError("VALIDATION_FAILED", { detail: "Refund amount must be a positive number." });
  if (Math.round(args.requestedCents) > maxRefundableCents)
    throw new DomainError("REFUND_EXCEEDS_CAPTURED", {
      maxRefundableCents,
      requestedCents: Math.round(args.requestedCents),
      detail: `Maximum refundable is ${(maxRefundableCents / 100).toFixed(2)}.`,
    });
  return { maxRefundableCents };
}

/**
 * Early departure (§10.6): the unused nights are refunded per the cancellation
 * policy's retention for the notice given, pro-rated on the nightly average.
 */
export function earlyDepartureRefund(args: {
  totalCents: number;
  nights: number;
  oldCheckOut: string;
  newCheckOut: string;
  retainPct: number;
}): { unusedNights: number; unusedCents: number; retainedCents: number; refundCents: number } {
  const unusedNights = Math.max(0, daysBetween(args.newCheckOut, args.oldCheckOut));
  const perNight = args.nights > 0 ? args.totalCents / args.nights : 0;
  const unusedCents = Math.round(perNight * unusedNights);
  const retainedCents = Math.round((unusedCents * Math.min(100, Math.max(0, args.retainPct))) / 100);
  return { unusedNights, unusedCents, retainedCents, refundCents: unusedCents - retainedCents };
}

// ---------------------------------------------------------------------------
// Dunning (§11.3 invoice.payment_failed / overdue, §17.2 "Invoice unpaid past terms")
// ---------------------------------------------------------------------------

export interface DunningPolicy {
  /** Days past due on which a reminder goes out (ascending). */
  reminderDays: number[];
  /** Days past due after which the org's new bookings need finance approval. */
  financeApprovalAfterDays: number;
  /** Days past due after which the org is suspended for new bookings. */
  suspendAfterDays: number;
}

export const DEFAULT_DUNNING_POLICY: DunningPolicy = {
  reminderDays: [1, 7, 14],
  financeApprovalAfterDays: 14,
  suspendAfterDays: 30,
};

export function parseDunningPolicy(reminderDays: unknown, financeAfter: unknown, suspendAfter: unknown): DunningPolicy {
  const days = Array.isArray(reminderDays)
    ? reminderDays
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 0)
        .sort((a, b) => a - b)
    : DEFAULT_DUNNING_POLICY.reminderDays;
  const fa = Number(financeAfter);
  const sa = Number(suspendAfter);
  return {
    reminderDays: days.length ? days : DEFAULT_DUNNING_POLICY.reminderDays,
    financeApprovalAfterDays: Number.isFinite(fa) && fa >= 0 ? fa : DEFAULT_DUNNING_POLICY.financeApprovalAfterDays,
    suspendAfterDays: Number.isFinite(sa) && sa >= 0 ? sa : DEFAULT_DUNNING_POLICY.suspendAfterDays,
  };
}

export function daysOverdue(dueAtIso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(dueAtIso)) / 86_400_000);
}

/**
 * Which reminder rung an overdue invoice has reached (1-based index into
 * reminderDays), or 0 when none is due yet. Rungs already sent are skipped, so a
 * job run after a gap sends only the latest one, never a backlog.
 */
export function dunningRung(daysPastDue: number, policy: DunningPolicy): number {
  let rung = 0;
  policy.reminderDays.forEach((d, i) => {
    if (daysPastDue >= d) rung = i + 1;
  });
  return rung;
}

export type CreditStanding = "good" | "watch" | "finance_approval" | "suspended";

/** The org's credit standing implied by its most overdue open invoice. */
export function creditStandingFor(maxDaysOverdue: number | null, policy: DunningPolicy): CreditStanding {
  if (maxDaysOverdue == null || maxDaysOverdue < 1) return "good";
  if (maxDaysOverdue >= policy.suspendAfterDays) return "suspended";
  if (maxDaysOverdue >= policy.financeApprovalAfterDays) return "finance_approval";
  return "watch";
}

/** Idempotency keys are derived, never random: a retried job must hit the same Stripe object. */
export const paymentKeys = {
  intent: (bookingId: string, quoteId: string | null, attempt: number) =>
    `pi:${bookingId}:${quoteId ?? "none"}:${attempt}`,
  capture: (paymentIntentId: string) => `capture:${paymentIntentId}`,
  cancel: (paymentIntentId: string) => `cancel:${paymentIntentId}`,
  invoice: (bookingId: string) => `inv:${bookingId}`,
  balanceInvoice: (bookingId: string) => `inv:${bookingId}:balance`,
  supplementaryInvoice: (modificationId: string) => `inv:mod:${modificationId}`,
  hostaway: (bookingId: string) => `ha:${bookingId}`,
};

/** How this partner pays, in one sentence for the price panel and the request review (brief §7.4, §7.5). */
export const PAY_MODE_SENTENCE: Record<PaymentMode, string> = {
  card_authorise: "Your card is held when you send the request and charged only if Live Luxe approves.",
  deposit: "A deposit is charged to your card only if Live Luxe approves; the balance is invoiced before check-in.",
  invoice: "No card needed. Live Luxe issues an invoice on your account terms when it approves.",
};
