/**
 * Cancellation policy — spec §10.3 (Cancellation row), §11.6 Refund/CreditNote,
 * Appendix B CONFIRMED→CANCELLED side effects.
 *
 *   Before the cut-off (settings `cancellation.cutoff_days`, default 14) a
 *   partner may cancel a confirmed booking themselves; the refund is computed
 *   from the retention schedule and issued automatically.
 *   After the cut-off the partner can only *request* a cancellation; Live Luxe
 *   decides, with the policy-calculated retention shown to both sides.
 *
 * The retention schedule (settings `cancellation.retention_schedule`) is a list
 * of { daysBefore, retainPct } rows: the first row whose `daysBefore` is at or
 * below the number of days until check-in applies, evaluated from the largest
 * `daysBefore` down. An empty schedule means: full refund at or before the
 * cut-off, no refund after it.
 *
 * Retention applies to the accommodation only. The cleaning fee (with its share of
 * tax) always comes back, because no clean happens for a cancelled stay (David,
 * 20 Oct 2026). Pass `cleaningFeeCents` from the accepted quote's lines.
 *
 * Pure: no framework, database or Stripe imports (spec §3.2).
 */
import type { BookingStatus } from "./booking-state-machine";
import { daysBetween } from "./dates";

export interface RetentionRule {
  /** Applies when the booking is cancelled at least this many days before check-in. */
  daysBefore: number;
  /** Share of the booking total Live Luxe keeps, 0–100. */
  retainPct: number;
}

export interface CancellationPolicy {
  cutoffDays: number;
  schedule: RetentionRule[];
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = { cutoffDays: 14, schedule: [] };

/** Parse the two settings rows defensively; a malformed value falls back to the default. */
export function parseCancellationPolicy(cutoff: unknown, schedule: unknown): CancellationPolicy {
  const cutoffDays = Number(cutoff);
  const rules: RetentionRule[] = Array.isArray(schedule)
    ? schedule
        .map((r) => ({
          daysBefore: Number((r as RetentionRule)?.daysBefore),
          retainPct: Number((r as RetentionRule)?.retainPct),
        }))
        .filter((r) => Number.isFinite(r.daysBefore) && Number.isFinite(r.retainPct) && r.daysBefore >= 0)
        .map((r) => ({ daysBefore: Math.floor(r.daysBefore), retainPct: Math.min(100, Math.max(0, r.retainPct)) }))
    : [];
  return {
    cutoffDays: Number.isFinite(cutoffDays) && cutoffDays >= 0 ? Math.floor(cutoffDays) : 14,
    schedule: rules,
  };
}

/** Percentage of the total retained when cancelling `daysUntilCheckIn` days out. */
export function retentionPctFor(daysUntilCheckIn: number, policy: CancellationPolicy): number {
  const days = Math.max(0, daysUntilCheckIn);
  if (policy.schedule.length === 0) return days >= policy.cutoffDays ? 0 : 100;
  const applicable = [...policy.schedule].sort((a, b) => b.daysBefore - a.daysBefore).find((r) => days >= r.daysBefore);
  return applicable ? applicable.retainPct : 100;
}

/** Statuses a partner may withdraw from without any money question (nothing captured yet). */
export const WITHDRAWABLE_STATUSES: readonly BookingStatus[] = ["SUBMITTED", "UNDER_REVIEW", "AWAITING_PAYMENT"];
/** Statuses where cancelling is a money event (captured payment or issued invoice). */
export const CANCELLABLE_STATUSES: readonly BookingStatus[] = ["APPROVED", "CONFIRMED", "CHECKED_IN"];

export type CancellationKind = "withdraw" | "cancel";

export interface CancellationQuote {
  kind: CancellationKind;
  daysUntilCheckIn: number;
  /** Partner may do this themselves (withdrawals always; cancellations only before the cut-off). */
  selfService: boolean;
  retainPct: number;
  retainedCents: number;
  /** What goes back to the partner: captured card money first, otherwise an invoice credit. */
  refundCents: number;
  /** The captured amount the refund is drawn from (0 for invoice-mode or uncaptured bookings). */
  capturedCents: number;
}

export interface CancellationInput {
  status: BookingStatus;
  checkIn: string;
  today: string;
  totalCents: number;
  capturedCents: number;
  policy: CancellationPolicy;
  /** Cleaning fee including its tax share (see cleaningFeeWithTax); never retained. Default 0. */
  cleaningFeeCents?: number;
}

/**
 * The cleaning fee line plus its proportional share of the tax line, from a quote's lines.
 * Tax is one line over the whole subtotal, so the fee's share is fee × tax ÷ subtotal.
 */
export function cleaningFeeWithTax(args: {
  lines: ReadonlyArray<{ kind: string; amountCents: number }>;
  subtotalCents: number;
  taxCents: number;
}): number {
  const fee = args.lines.filter((l) => l.kind === "cleaning_fee").reduce((s, l) => s + Math.max(0, l.amountCents), 0);
  if (fee <= 0) return 0;
  const tax = args.subtotalCents > 0 ? Math.round((fee * Math.max(0, args.taxCents)) / args.subtotalCents) : 0;
  return fee + tax;
}

/** What cancelling now would mean, or null when the status cannot be cancelled at all. */
export function cancellationQuote(input: CancellationInput): CancellationQuote | null {
  const daysUntilCheckIn = daysBetween(input.today, input.checkIn);
  if (WITHDRAWABLE_STATUSES.includes(input.status)) {
    return {
      kind: "withdraw",
      daysUntilCheckIn,
      selfService: true,
      retainPct: 0,
      retainedCents: 0,
      refundCents: input.capturedCents,
      capturedCents: input.capturedCents,
    };
  }
  if (!CANCELLABLE_STATUSES.includes(input.status)) return null;
  const retainPct = retentionPctFor(daysUntilCheckIn, input.policy);
  const cleaning = Math.min(Math.max(0, input.cleaningFeeCents ?? 0), Math.max(0, input.totalCents));
  const retainedCents = Math.round(((input.totalCents - cleaning) * retainPct) / 100);
  const refundable = Math.max(0, input.totalCents - retainedCents);
  return {
    kind: "cancel",
    daysUntilCheckIn,
    selfService: daysUntilCheckIn >= input.policy.cutoffDays,
    retainPct,
    retainedCents,
    refundCents: Math.min(refundable, input.capturedCents),
    capturedCents: input.capturedCents,
  };
}

/** Bound an ops override of the refund to what was actually captured. */
export function clampRefund(requestedCents: number, capturedCents: number): number {
  if (!Number.isFinite(requestedCents)) return 0;
  return Math.min(Math.max(0, Math.round(requestedCents)), Math.max(0, capturedCents));
}

export const CANCELLATION_REASONS = [
  "claim_closed",
  "guest_no_longer_needs",
  "alternative_found",
  "dates_changed",
  "other",
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  claim_closed: "Claim closed or withdrawn",
  guest_no_longer_needs: "Guest no longer needs the accommodation",
  alternative_found: "Alternative accommodation found",
  dates_changed: "Dates changed",
  other: "Other",
};
