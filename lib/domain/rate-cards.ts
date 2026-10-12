/**
 * Partner rate cards — spec §9 layer 3.
 *
 * Pure helpers: shape the database row into the quote engine's RateCard, and
 * validate the ops form that publishes a new version. Money is integer cents;
 * percentages are plain numbers 0–100.
 */
import type { RateCard } from "./quote-engine";

export interface RateCardRowLike {
  id: string;
  version: number;
  name: string;
  discount_pct: number | string;
  fixed_rates: unknown;
  los_tiers: unknown;
  fee_overrides: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Database row → quote-engine input. Unknown or malformed JSON is ignored rather than trusted. */
export function rateCardFromRow(row: RateCardRowLike): RateCard {
  const card: RateCard = { id: row.id, version: row.version, discountPct: clampPct(num(row.discount_pct) ?? 0) };

  if (isObj(row.fixed_rates)) {
    const byListingId = centsMap(row.fixed_rates.byListingId);
    const byTag = centsMap(row.fixed_rates.byTag);
    if (byListingId || byTag) card.fixedNightlyCents = { ...(byListingId && { byListingId }), ...(byTag && { byTag }) };
  }

  if (Array.isArray(row.los_tiers)) {
    const tiers = row.los_tiers
      .filter(isObj)
      .map((t) => ({ minNights: num(t.minNights), discountPct: num(t.discountPct) }))
      .filter((t): t is { minNights: number; discountPct: number } => t.minNights !== null && t.discountPct !== null)
      .filter((t) => t.minNights >= 1 && t.discountPct > 0 && t.discountPct <= 100)
      .map((t) => ({ minNights: Math.floor(t.minNights), discountPct: t.discountPct }));
    if (tiers.length) card.losTiers = tiers;
  }

  if (isObj(row.fee_overrides)) {
    const from = num(row.fee_overrides.cleaningFeeFromNights);
    const waive = row.fee_overrides.waiveSecurityDeposit === true;
    if ((from !== null && from >= 1) || waive) {
      card.feeWaivers = {
        ...(from !== null && from >= 1 && { cleaningFeeFromNights: Math.floor(from) }),
        ...(waive && { waiveSecurityDeposit: true }),
      };
    }
  }
  return card;
}

function centsMap(v: unknown): Record<string, number> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v)) {
    const n = num(raw);
    if (n !== null && n >= 0) out[k] = Math.round(n);
  }
  return Object.keys(out).length ? out : undefined;
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

// ---------------------------------------------------------------------------
// Ops form → publish arguments
// ---------------------------------------------------------------------------

export interface RateCardFormValues {
  name: string;
  discountPct: number;
  losTiers: { minNights: number; discountPct: number }[];
  feeOverrides: { cleaningFeeFromNights?: number; waiveSecurityDeposit?: boolean };
  validFrom: string;
  validTo: string | null;
}

export type RateCardFormResult =
  { ok: true; values: RateCardFormValues } | { ok: false; errors: Record<string, string[]> };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates the publish form. `losTiers` arrives as free text, one tier per line,
 * "nights:percent" (e.g. "90:5"). `today` is the property-timezone calendar date.
 */
export function parseRateCardForm(raw: Record<string, string | undefined>, today: string): RateCardFormResult {
  const errors: Record<string, string[]> = {};
  const add = (f: string, m: string) => (errors[f] ??= []).push(m);

  const name = (raw.name ?? "").trim();
  if (name.length < 2 || name.length > 80) add("name", "Give the card a short name (2–80 characters).");

  const discountPct = Number((raw.discountPct ?? "0").trim() || "0");
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100)
    add("discountPct", "Discount must be between 0 and 100 percent.");

  const losTiers: { minNights: number; discountPct: number }[] = [];
  const seen = new Set<number>();
  for (const line of (raw.losTiers ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = /^(\d{1,3})\s*[:=]\s*(\d{1,3}(?:\.\d+)?)\s*%?$/.exec(t);
    if (!m) {
      add("losTiers", `"${t}" is not in the form nights:percent (e.g. 90:5).`);
      continue;
    }
    const minNights = Number(m[1]);
    const pct = Number(m[2]);
    if (minNights < 1 || pct <= 0 || pct > 100) add("losTiers", `"${t}" is out of range.`);
    else if (seen.has(minNights)) add("losTiers", `Two tiers start at ${minNights} nights.`);
    else {
      seen.add(minNights);
      losTiers.push({ minNights, discountPct: pct });
    }
  }
  losTiers.sort((a, b) => a.minNights - b.minNights);

  const feeOverrides: RateCardFormValues["feeOverrides"] = {};
  const cleanFrom = (raw.cleaningFeeFromNights ?? "").trim();
  if (cleanFrom) {
    const n = Number(cleanFrom);
    if (!Number.isInteger(n) || n < 1) add("cleaningFeeFromNights", "Enter a whole number of nights, 1 or more.");
    else feeOverrides.cleaningFeeFromNights = n;
  }
  if (raw.waiveSecurityDeposit === "on" || raw.waiveSecurityDeposit === "true")
    feeOverrides.waiveSecurityDeposit = true;

  const validFrom = (raw.validFrom ?? "").trim();
  if (!ISO_DATE.test(validFrom)) add("validFrom", "Choose the date the card takes effect.");
  else if (validFrom < today)
    add("validFrom", "A card cannot start in the past; quotes already issued keep their price.");

  const validToRaw = (raw.validTo ?? "").trim();
  let validTo: string | null = null;
  if (validToRaw) {
    if (!ISO_DATE.test(validToRaw)) add("validTo", "End date must be a calendar date.");
    else if (validToRaw <= validFrom) add("validTo", "End date must be after the start date.");
    else validTo = validToRaw;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { name, discountPct, losTiers, feeOverrides, validFrom, validTo } };
}

/** Human summary for lists: "12% off · cleaning waived from 28 nights · 1 LOS tier". */
export function describeRateCard(card: RateCard): string {
  const parts: string[] = [];
  parts.push(card.discountPct > 0 ? `${card.discountPct}% off nightly` : "No percentage discount");
  if (card.losTiers?.length)
    parts.push(`${card.losTiers.length} length-of-stay tier${card.losTiers.length === 1 ? "" : "s"}`);
  if (card.feeWaivers?.cleaningFeeFromNights)
    parts.push(`cleaning fee waived from ${card.feeWaivers.cleaningFeeFromNights} nights`);
  if (card.feeWaivers?.waiveSecurityDeposit) parts.push("no security deposit");
  if (card.fixedNightlyCents) parts.push("fixed nightly rates");
  return parts.join(" · ");
}
