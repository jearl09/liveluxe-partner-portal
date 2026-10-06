/**
 * Quote engine — spec §9.
 *
 * Four ordered layers, each a discrete, testable function:
 *   1. Base nightly rate (per-day price from the Hostaway calendar)
 *   2. Length-of-stay adjustment (Hostaway weekly/monthly + rate-card LOS tiers)
 *   3. Partner rate card (percentage or fixed override; fixed wins; fee waivers)
 *   4. Fees, deposit and tax (cleaning, extra guest, pet, mid-stay clean, GST rule)
 *
 * All arithmetic is in integer cents. Percentages are rounded at each discrete
 * line, never compounded on floats. sum(lines) === total is a unit-test invariant.
 *
 * TAX: the GST rule is configurable (tax_rules in settings) and MUST be signed off
 * by Livluxe's accountant before launch (§9.1, §23.2 decision 1). The default
 * rule set below is a placeholder and is clearly marked as such.
 */
import { createHash } from "node:crypto";
import { applyPct, sumCents, type Cents } from "./money";
import { DomainError } from "./errors";

export interface QuoteInputs {
  listingId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  pets: number;
  /** Per-night prices in order; null = unknown → not quotable. */
  nightlyPricesCents: readonly (Cents | null)[];
  listing: {
    cleaningFeeCents: Cents;
    extraPersonFeeCents: Cents;
    guestsIncluded: number;
    securityDepositCents: Cents;
    weeklyDiscountPct: number;
    monthlyDiscountPct: number;
    petFeeCents?: Cents;
    suitabilityTags?: readonly string[];
  };
  rateCard: RateCard | null;
  policy: PricingPolicy;
}

export interface RateCard {
  id: string;
  version: number;
  /** Percentage off the post-LOS nightly rate, 0–100. */
  discountPct: number;
  /** Fixed nightly override by listing id or suitability tag. Fixed wins over percentage. */
  fixedNightlyCents?: { byListingId?: Record<string, Cents>; byTag?: Record<string, Cents> };
  /** Additional LOS tiers beyond Hostaway's weekly/monthly, e.g. { minNights: 90, discountPct: 5 }. */
  losTiers?: readonly { minNights: number; discountPct: number }[];
  /** Fee waivers, e.g. cleaning fee waived at ≥ 28 nights. */
  feeWaivers?: { cleaningFeeFromNights?: number; waiveSecurityDeposit?: boolean };
}

export interface PricingPolicy {
  /** Auto-add a mid-stay clean every N nights for stays ≥ threshold. */
  midStayClean: { fromNights: number; everyNights: number; feeCents: Cents } | null;
  /** Tax rules evaluated in order; first match wins. PLACEHOLDER until accountant sign-off. */
  taxRules: readonly TaxRule[];
}

export interface TaxRule {
  label: string;
  /** Applies when nights >= minNights (and < maxNights if given). */
  minNights: number;
  maxNights?: number;
  /** Percentage of the taxable subtotal applied as a separate line. */
  ratePct: number;
}

export type LineKind =
  | "accommodation"
  | "los_discount"
  | "partner_discount"
  | "cleaning_fee"
  | "mid_stay_clean"
  | "extra_guest_fee"
  | "pet_fee"
  | "tax";

export interface QuoteLine {
  kind: LineKind;
  label: string;
  amountCents: Cents; // negative for discounts
  meta?: Record<string, unknown>;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: Cents; // before tax
  taxCents: Cents;
  totalCents: Cents;
  nightlyAverageCents: Cents;
  nights: number;
  securityDepositCents: Cents; // authorised separately, not part of total
  rateCardId: string | null;
  rateCardVersion: number | null;
  priceHash: string;
}

/** Layer 1: base accommodation — sum of per-night prices, never average × nights. */
export function layerBase(prices: readonly (Cents | null)[]): Cents {
  if (prices.length === 0) throw new DomainError("VALIDATION_FAILED", { reason: "no_nights" });
  const unpriced = prices.map((p, i) => (p === null ? i : -1)).filter((i) => i >= 0);
  if (unpriced.length) {
    // Price on application — never substitute the listing base price (§9.1, §17.1).
    throw new DomainError("VALIDATION_FAILED", { reason: "price_on_application", unpricedNightIndexes: unpriced });
  }
  return sumCents(prices as Cents[]);
}

/** Layer 2: LOS — the single best applicable tier (Hostaway weekly/monthly plus rate-card tiers). */
export function layerLos(
  baseCents: Cents,
  nights: number,
  weeklyPct: number,
  monthlyPct: number,
  extraTiers: readonly { minNights: number; discountPct: number }[] = [],
): { pct: number; discountCents: Cents } {
  const tiers = [
    { minNights: 7, discountPct: weeklyPct },
    { minNights: 28, discountPct: monthlyPct },
    ...extraTiers,
  ].filter((t) => t.discountPct > 0 && nights >= t.minNights);
  const pct = tiers.reduce((best, t) => Math.max(best, t.discountPct), 0);
  return { pct, discountCents: pct === 0 ? 0 : -applyPct(baseCents, pct) };
}

/** Layer 3: partner rate card. Fixed override wins over percentage. */
export function layerRateCard(
  postLosCents: Cents,
  nights: number,
  card: RateCard | null,
  listingId: string,
  tags: readonly string[] = [],
): { discountCents: Cents; mode: "none" | "percentage" | "fixed" } {
  if (!card) return { discountCents: 0, mode: "none" };

  const fixed =
    card.fixedNightlyCents?.byListingId?.[listingId] ??
    tags.map((t) => card.fixedNightlyCents?.byTag?.[t]).find((v): v is Cents => typeof v === "number");

  if (typeof fixed === "number") {
    const target = fixed * nights;
    return { discountCents: target - postLosCents, mode: "fixed" };
  }
  if (card.discountPct > 0) {
    return { discountCents: -applyPct(postLosCents, card.discountPct), mode: "percentage" };
  }
  return { discountCents: 0, mode: "none" };
}

/** Deterministic integrity hash — recomputed server-side at submission and approval (§9.3). */
export function computePriceHash(parts: {
  listingId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  pets: number;
  lines: readonly QuoteLine[];
  rateCardId: string | null;
  rateCardVersion: number | null;
}): string {
  const canonical = JSON.stringify({
    l: parts.listingId,
    i: parts.checkIn,
    o: parts.checkOut,
    g: [parts.adults, parts.children, parts.pets],
    r: [parts.rateCardId, parts.rateCardVersion],
    x: parts.lines.map((ln) => [ln.kind, ln.amountCents]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildQuote(input: QuoteInputs): Quote {
  const nights = input.nightlyPricesCents.length;
  const lines: QuoteLine[] = [];

  // 1. Base
  const base = layerBase(input.nightlyPricesCents);
  lines.push({ kind: "accommodation", label: `Accommodation (${nights} nights)`, amountCents: base });

  // 2. LOS
  const los = layerLos(
    base,
    nights,
    input.listing.weeklyDiscountPct,
    input.listing.monthlyDiscountPct,
    input.rateCard?.losTiers,
  );
  if (los.discountCents !== 0) {
    lines.push({
      kind: "los_discount",
      label: `Length-of-stay discount (${los.pct}%)`,
      amountCents: los.discountCents,
      meta: { pct: los.pct },
    });
  }
  const postLos = base + los.discountCents;

  // 3. Rate card
  const rc = layerRateCard(postLos, nights, input.rateCard, input.listingId, input.listing.suitabilityTags ?? []);
  if (rc.discountCents !== 0) {
    lines.push({
      kind: "partner_discount",
      label: rc.mode === "fixed" ? "Partner contracted rate" : `Partner rate card (${input.rateCard!.discountPct}%)`,
      amountCents: rc.discountCents,
      meta: { mode: rc.mode },
    });
  }

  // 4. Fees
  const waiveCleaning =
    input.rateCard?.feeWaivers?.cleaningFeeFromNights !== undefined &&
    nights >= input.rateCard.feeWaivers.cleaningFeeFromNights;
  if (input.listing.cleaningFeeCents > 0 && !waiveCleaning) {
    lines.push({ kind: "cleaning_fee", label: "Cleaning fee", amountCents: input.listing.cleaningFeeCents });
  }

  const msc = input.policy.midStayClean;
  if (msc && nights >= msc.fromNights) {
    const count = Math.floor((nights - 1) / msc.everyNights);
    if (count > 0) {
      lines.push({
        kind: "mid_stay_clean",
        label: `Mid-stay clean × ${count}`,
        amountCents: count * msc.feeCents,
        meta: { count },
      });
    }
  }

  const guests = input.adults + input.children;
  const extraGuests = Math.max(0, guests - input.listing.guestsIncluded);
  if (extraGuests > 0 && input.listing.extraPersonFeeCents > 0) {
    lines.push({
      kind: "extra_guest_fee",
      label: `Extra guest fee (${extraGuests} × ${nights} nights)`,
      amountCents: extraGuests * nights * input.listing.extraPersonFeeCents,
    });
  }

  if (input.pets > 0 && (input.listing.petFeeCents ?? 0) > 0) {
    lines.push({
      kind: "pet_fee",
      label: `Pet fee (${input.pets})`,
      amountCents: input.pets * input.listing.petFeeCents!,
      meta: { pets: input.pets },
    });
  }

  const subtotal = sumCents(lines.map((l) => l.amountCents));

  // Tax — configurable rule set, first match wins.
  const rule = input.policy.taxRules.find(
    (r) => nights >= r.minNights && (r.maxNights === undefined || nights < r.maxNights),
  );
  const tax = rule ? applyPct(subtotal, rule.ratePct) : 0;
  if (rule) lines.push({ kind: "tax", label: rule.label, amountCents: tax, meta: { ratePct: rule.ratePct } });

  const total = subtotal + tax;
  const deposit = input.rateCard?.feeWaivers?.waiveSecurityDeposit ? 0 : input.listing.securityDepositCents;

  const rateCardId = input.rateCard?.id ?? null;
  const rateCardVersion = input.rateCard?.version ?? null;

  return {
    lines,
    subtotalCents: subtotal,
    taxCents: tax,
    totalCents: total,
    nightlyAverageCents: Math.round(total / nights),
    nights,
    securityDepositCents: deposit,
    rateCardId,
    rateCardVersion,
    priceHash: computePriceHash({
      listingId: input.listingId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: input.adults,
      children: input.children,
      pets: input.pets,
      lines,
      rateCardId,
      rateCardVersion,
    }),
  };
}

/**
 * PLACEHOLDER tax rules. Flat 10% GST on everything until Livluxe's accountant
 * confirms the treatment for 28+ night stays (§9.1). Replace via the settings table.
 */
export const PLACEHOLDER_TAX_RULES: readonly TaxRule[] = [{ label: "GST (10%)", minNights: 1, ratePct: 10 }];

/** §9.3 — honour an expired quote if the price moved by less than tolerancePct. */
export function priceChangeDecision(
  originalTotalCents: Cents,
  newTotalCents: Cents,
  tolerancePct = 2,
): "honour_unchanged" | "honour_absorb_variance" | "require_acceptance" {
  if (originalTotalCents === newTotalCents) return "honour_unchanged";
  const deltaPct = (Math.abs(newTotalCents - originalTotalCents) / originalTotalCents) * 100;
  return deltaPct < tolerancePct ? "honour_absorb_variance" : "require_acceptance";
}
