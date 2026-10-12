/**
 * Rate-card reads and the publish call (spec §9 layer 3, §13.4 rate-card screen).
 * Everything goes through the RLS client: a partner resolves only their own card,
 * finance/admin see and publish for every organisation (policy rate_cards_*).
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { RateCardRow } from "@/lib/db/types";
import type { RateCard } from "@/lib/domain/quote-engine";
import { rateCardFromRow, type RateCardFormValues } from "@/lib/domain/rate-cards";
import { log } from "@/lib/observability/logger";
import { rpcErrorToDomain } from "@/lib/requests/errors";
import { isUuid } from "@/lib/domain/ids";

/** The card in force for `orgId` on `date` (the stay's check-in), or null. Never throws: pricing must not fail because of a card. */
export async function effectiveRateCard(orgId: string, date: string): Promise<RateCard | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("rate_card_for", { p_org_id: orgId, p_date: date });
  if (error) {
    log.error("rate_card.lookup_failed", { orgId, date, error: error.message });
    return null;
  }
  const row = data?.[0];
  return row ? rateCardFromRow(row) : null;
}

export interface RateCardVersion {
  row: RateCardRow;
  card: RateCard;
  validFrom: string;
  /** Exclusive end date, or null when open-ended. */
  validTo: string | null;
  current: boolean;
}

/** Parses a Postgres daterange literal such as "[2026-10-12,2027-01-01)" or "[2026-10-12,)". */
export function parseDateRange(literal: string): { from: string; to: string | null } {
  const m = /^[\[(]\s*([0-9-]*)\s*,\s*([0-9-]*)\s*[\])]$/.exec(literal);
  return { from: m?.[1] ?? "", to: m?.[2] ? m[2] : null };
}

/** All versions for one organisation, newest first. */
export async function listRateCards(orgId: string, today: string): Promise<RateCardVersion[]> {
  if (!isUuid(orgId)) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("rate_cards")
    .select("*")
    .eq("org_id", orgId)
    .order("version", { ascending: false });
  if (error) throw new Error(`rate_cards read failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const { from, to } = parseDateRange(row.valid_range);
    return {
      row,
      card: rateCardFromRow(row),
      validFrom: from,
      validTo: to,
      current: from <= today && (to === null || today < to),
    };
  });
}

/** Current card per organisation for the overview table. */
export async function currentRateCardsByOrg(today: string): Promise<Map<string, RateCardVersion>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("rate_cards").select("*").order("version", { ascending: false });
  if (error) throw new Error(`rate_cards read failed: ${error.message}`);
  const out = new Map<string, RateCardVersion>();
  for (const row of data ?? []) {
    const { from, to } = parseDateRange(row.valid_range);
    const current = from <= today && (to === null || today < to);
    if (current && !out.has(row.org_id))
      out.set(row.org_id, { row, card: rateCardFromRow(row), validFrom: from, validTo: to, current });
  }
  return out;
}

export async function publishRateCard(orgId: string, v: RateCardFormValues): Promise<RateCardRow> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("rate_card_publish", {
    p_org_id: orgId,
    p_name: v.name,
    p_discount_pct: v.discountPct,
    p_los_tiers: v.losTiers as never,
    p_fee_overrides: v.feeOverrides as never,
    p_fixed_rates: {} as never,
    p_valid_from: v.validFrom,
    p_valid_to: v.validTo,
  });
  if (error) throw rpcErrorToDomain(error);
  return data as RateCardRow;
}
