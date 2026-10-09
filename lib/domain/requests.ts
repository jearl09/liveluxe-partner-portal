/**
 * Booking request rules — spec §7.1 (submission), §11 (SLA), §13.4 (queue bands).
 * Pure: validation, SLA arithmetic and view-model helpers. No I/O.
 */
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { BookingStatus } from "./booking-state-machine";
import type { Quote, QuoteLine } from "./quote-engine";
import { computePriceHash } from "./quote-engine";
import { sumCents, type Cents } from "./money";

// ---------------------------------------------------------------------------
// Submission form
// ---------------------------------------------------------------------------
export interface RequestFormInput {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  claimRef: string;
  poNumber: string;
  costCentre: string;
  notes: string;
  /** Explicit confirmation that the partner accepts the quote and terms. */
  acceptTerms: boolean;
}

export interface OrgRequestRules {
  requireClaimRef: boolean;
  requirePoNumber: boolean;
}

export interface FormValidation {
  ok: boolean;
  errors: Partial<Record<keyof RequestFormInput, string>>;
  values: RequestFormInput;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRequestForm(raw: Record<string, string | undefined>, rules: OrgRequestRules): FormValidation {
  const v: RequestFormInput = {
    guestName: (raw.guestName ?? "").trim().slice(0, 120),
    guestEmail: (raw.guestEmail ?? "").trim().slice(0, 254),
    guestPhone: (raw.guestPhone ?? "").trim().slice(0, 40),
    claimRef: (raw.claimRef ?? "").trim().slice(0, 60),
    poNumber: (raw.poNumber ?? "").trim().slice(0, 60),
    costCentre: (raw.costCentre ?? "").trim().slice(0, 60),
    notes: (raw.notes ?? "").trim().slice(0, 2000),
    acceptTerms: raw.acceptTerms === "on" || raw.acceptTerms === "true",
  };
  const errors: FormValidation["errors"] = {};
  if (v.guestName.length < 2) errors.guestName = "Enter the guest's name.";
  if (v.guestEmail && !EMAIL.test(v.guestEmail)) errors.guestEmail = "That email address doesn't look right.";
  if (rules.requireClaimRef && !v.claimRef) errors.claimRef = "Your organisation requires a claim reference.";
  if (rules.requirePoNumber && !v.poNumber) errors.poNumber = "Your organisation requires a PO number.";
  if (!v.acceptTerms) errors.acceptTerms = "Please confirm the quote and terms before submitting.";
  return { ok: Object.keys(errors).length === 0, errors, values: v };
}

export function guestsSummary(adults: number, children: number, pets: number): string {
  const parts = [`${adults} ${adults === 1 ? "adult" : "adults"}`];
  if (children) parts.push(`${children} ${children === 1 ? "child" : "children"}`);
  if (pets) parts.push(`${pets} ${pets === 1 ? "pet" : "pets"}`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// SLA — decision deadline counted in business hours (§11.1)
// ---------------------------------------------------------------------------
export interface BusinessHours {
  start: string; // "08:00"
  end: string; // "18:00"
  timezone: string; // "Australia/Melbourne"
  /** ISO weekdays that count, 1 = Monday … 7 = Sunday. Default Mon–Fri. */
  weekdays?: readonly number[];
}

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
};

/**
 * Adds `hours` of business time to `startIso`. Time outside the window (and on
 * non-business days) does not count, so a 4 h SLA raised at 5 pm Friday is due
 * 11 am Monday. Pure calendar arithmetic in the configured timezone.
 */
export function addBusinessHours(startIso: string, hours: number, bh: BusinessHours): string {
  const weekdays = new Set(bh.weekdays ?? [1, 2, 3, 4, 5]);
  const open = hm(bh.start);
  const close = hm(bh.end);
  let remaining = Math.round(hours * 60);

  // Work in zoned wall-clock minutes; convert back at the end.
  let local = toZonedTime(new Date(startIso), bh.timezone);
  const isoDow = (d: Date) => ((d.getDay() + 6) % 7) + 1;
  const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const setMinutes = (d: Date, mins: number) => {
    const n = new Date(d);
    n.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return n;
  };
  const nextDay = (d: Date) => {
    const n = new Date(d);
    n.setDate(n.getDate() + 1);
    return setMinutes(n, open);
  };

  for (let guard = 0; guard < 400; guard++) {
    if (!weekdays.has(isoDow(local))) {
      local = nextDay(local);
      continue;
    }
    const now = minutesOf(local);
    if (now < open) local = setMinutes(local, open);
    else if (now >= close) {
      local = nextDay(local);
      continue;
    }
    const available = close - minutesOf(local);
    if (remaining <= available) {
      local = setMinutes(local, minutesOf(local) + remaining);
      remaining = 0;
      break;
    }
    remaining -= available;
    local = nextDay(local);
  }
  return fromZonedTime(local, bh.timezone).toISOString();
}

export type SlaBand = "on_track" | "at_risk" | "breached" | "paused" | "none";

/** Queue colour band from the SLA clock (§13.4). At-risk from 80 % elapsed; escalation ladder in settings. */
export function slaBand(
  submittedAtIso: string | null,
  decisionDueIso: string | null,
  now: Date,
  opts: { paused?: boolean; atRiskPct?: number } = {},
): SlaBand {
  if (opts.paused) return "paused";
  if (!decisionDueIso || !submittedAtIso) return "none";
  const start = new Date(submittedAtIso).getTime();
  const due = new Date(decisionDueIso).getTime();
  if (now.getTime() >= due) return "breached";
  const total = due - start;
  if (total <= 0) return "breached";
  const elapsedPct = ((now.getTime() - start) / total) * 100;
  return elapsedPct >= (opts.atRiskPct ?? 80) ? "at_risk" : "on_track";
}

/** Statuses that sit in the ops queue, i.e. waiting on Live Luxe. */
export const QUEUE_STATUSES: readonly BookingStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

/** Where a request shows up for the partner: open, upcoming, or history. */
export function requestBucket(status: BookingStatus): "open" | "upcoming" | "history" {
  switch (status) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "COUNTER_OFFERED":
    case "AWAITING_PAYMENT":
      return "open";
    case "APPROVED":
    case "CONFIRMED":
    case "CHECKED_IN":
      return "upcoming";
    default:
      return "history";
  }
}

// ---------------------------------------------------------------------------
// Counter-offers (§10.1 COUNTER_OFFERED)
// ---------------------------------------------------------------------------
export interface CounterOfferInput {
  newTotalCents: Cents | null;
  newCheckIn: string | null;
  newCheckOut: string | null;
  message: string;
}

export function validateCounterOffer(
  raw: Record<string, string | undefined>,
  current: { totalCents: Cents | null; checkIn: string; checkOut: string },
): { ok: boolean; errors: string[]; value: CounterOfferInput } {
  const errors: string[] = [];
  const message = (raw.message ?? "").trim().slice(0, 1000);
  const totalRaw = (raw.newTotal ?? "").replace(/[^0-9.]/g, "");
  const newTotalCents = totalRaw ? Math.round(Number(totalRaw) * 100) : null;
  const newCheckIn = (raw.newCheckIn ?? "").trim() || null;
  const newCheckOut = (raw.newCheckOut ?? "").trim() || null;
  if (newTotalCents !== null && (!Number.isFinite(newTotalCents) || newTotalCents <= 0))
    errors.push("Enter a valid total.");
  if ((newCheckIn && !newCheckOut) || (!newCheckIn && newCheckOut)) errors.push("Enter both new dates or neither.");
  if (newCheckIn && newCheckOut && newCheckOut <= newCheckIn) errors.push("Check-out must be after check-in.");
  const datesChanged = !!newCheckIn && (newCheckIn !== current.checkIn || newCheckOut !== current.checkOut);
  const totalChanged = newTotalCents !== null && newTotalCents !== current.totalCents;
  if (!datesChanged && !totalChanged) errors.push("A counter-offer needs a different price or different dates.");
  if (!message) errors.push("Tell the partner why you are proposing this.");
  return {
    ok: errors.length === 0,
    errors,
    value: {
      newTotalCents: totalChanged ? newTotalCents : null,
      newCheckIn: datesChanged ? newCheckIn : null,
      newCheckOut: datesChanged ? newCheckOut : null,
      message,
    },
  };
}

/**
 * Re-prices a quote to an ops-chosen total by appending one adjustment line, so
 * sum(lines) === total still holds and the price hash stays verifiable (§9.3).
 */
export function applyOpsAdjustment(
  quote: Quote,
  ctx: { listingId: string; checkIn: string; checkOut: string; adults: number; children: number; pets: number },
  newTotalCents: Cents,
  label = "Live Luxe adjustment",
): Quote {
  const delta = newTotalCents - quote.totalCents;
  if (delta === 0) return quote;
  const lines: QuoteLine[] = [...quote.lines, { kind: "adjustment", label, amountCents: delta }];
  const subtotal = sumCents(lines.filter((l) => l.kind !== "tax").map((l) => l.amountCents));
  const tax = sumCents(lines.filter((l) => l.kind === "tax").map((l) => l.amountCents));
  return {
    ...quote,
    lines,
    subtotalCents: subtotal,
    taxCents: tax,
    totalCents: subtotal + tax,
    nightlyAverageCents: Math.round((subtotal + tax) / quote.nights),
    priceHash: computePriceHash({
      ...ctx,
      lines,
      rateCardId: quote.rateCardId,
      rateCardVersion: quote.rateCardVersion,
    }),
  };
}

/** Human label for a decline reason code (§13.4 structured reasons). */
export const DECLINE_REASON_LABELS: Record<string, string> = {
  no_availability: "No longer available",
  unsuitable_property: "Property not suitable for this stay",
  owner_block: "Owner has blocked these dates",
  commercial_terms: "Commercial terms",
  guest_profile: "Guest profile",
  maintenance: "Maintenance required",
  other: "Other",
};
