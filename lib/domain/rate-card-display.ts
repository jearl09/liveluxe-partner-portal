/** A rate card in a few words for lists (brief §6.5, §6.6). Pure. */
import type { RateCard } from "./quote-engine";

export function rateCardDiscount(card: RateCard): string {
  const fixed =
    Object.keys(card.fixedNightlyCents?.byListingId ?? {}).length +
    Object.keys(card.fixedNightlyCents?.byTag ?? {}).length;
  if (fixed > 0) return card.discountPct > 0 ? `${card.discountPct}% off, some fixed rates` : "Fixed nightly rates";
  return card.discountPct > 0 ? `${card.discountPct}% off` : "No discount";
}

export function rateCardTiers(card: RateCard): string | null {
  const t = [...(card.losTiers ?? [])].sort((a, b) => a.minNights - b.minNights);
  return t.length ? t.map((x) => `${x.minNights}n +${x.discountPct}%`).join(" · ") : null;
}

export function rateCardWaivers(card: RateCard): string | null {
  const w: string[] = [];
  if (card.feeWaivers?.cleaningFeeFromNights) w.push(`cleaning waived from ${card.feeWaivers.cleaningFeeFromNights}n`);
  if (card.feeWaivers?.waiveSecurityDeposit) w.push("no bond");
  return w.length ? w.join(" · ") : null;
}

export function rateCardSummary(card: RateCard): string {
  return [rateCardDiscount(card), rateCardTiers(card), rateCardWaivers(card)].filter(Boolean).join(" · ");
}
