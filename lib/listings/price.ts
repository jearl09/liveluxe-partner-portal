/**
 * Price a stay from synced data (spec §9, §15.1). Shared by the listing page and
 * POST /api/quotes so both show the same number.
 *
 * Partner rate cards and the settings-table pricing policy are not applied yet:
 * the quote is the Hostaway rate with Hostaway's own LOS discounts and fees, plus
 * the placeholder GST rule. Both are flagged in the UI as indicative.
 */
import "server-only";
import {
  resolveAvailability,
  type AvailabilityResult,
  type CalendarDay,
  type StayRequest,
} from "@/lib/domain/availability";
import { buildQuote, PLACEHOLDER_TAX_RULES, type Quote } from "@/lib/domain/quote-engine";
import { addDays } from "@/lib/domain/dates";
import { getCalendarDays, getListing, type ListingDetail } from "./load";

export interface PricedStay {
  detail: ListingDetail;
  days: CalendarDay[];
  availability: AvailabilityResult;
  /** Null when the stay is unavailable or any night is unpriced. */
  quote: Quote | null;
}

export async function priceStay(listingId: string, stay: StayRequest): Promise<PricedStay | null> {
  const detail = await getListing(listingId);
  if (!detail) return null;
  const l = detail.listing;

  // Include the check-out day so closed_on_departure can be evaluated.
  const days = await getCalendarDays(listingId, stay.checkIn, addDays(stay.checkOut, 0));
  const availability = resolveAvailability(
    days,
    { minNights: l.min_nights, maxNights: l.max_nights, maxGuests: l.max_guests ?? 0, maxPets: l.max_pets },
    stay,
  );

  let quote: Quote | null = null;
  if (availability.available && availability.quotable) {
    const nightly = days.filter((d) => d.date >= stay.checkIn && d.date < stay.checkOut).map((d) => d.priceCents);
    quote = buildQuote({
      ...stay,
      listingId,
      nightlyPricesCents: nightly,
      listing: {
        cleaningFeeCents: l.cleaning_fee_cents,
        extraPersonFeeCents: l.extra_person_fee_cents,
        guestsIncluded: l.guests_included,
        securityDepositCents: l.security_deposit_cents,
        weeklyDiscountPct: Number(l.weekly_discount_pct),
        monthlyDiscountPct: Number(l.monthly_discount_pct),
        suitabilityTags: l.suitability_tags,
      },
      rateCard: null, // TODO(week-2): the org's effective rate card for check-in
      policy: { midStayClean: null, taxRules: PLACEHOLDER_TAX_RULES }, // TODO(week-2): partner-safe settings read
    });
  }

  return { detail, days, availability, quote };
}
