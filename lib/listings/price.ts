/**
 * Price a stay from synced data (spec §9, §15.1). Shared by the listing page and
 * POST /api/quotes so both show the same number.
 *
 * The partner's rate card in force on the check-in date (§9 layer 3) is applied
 * when `orgId` is given. The settings-table pricing policy is not applied yet: the
 * tax line is the placeholder GST rule, flagged in the UI as indicative.
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
import { effectiveRateCard } from "@/lib/rate-cards/load";
import { getCalendarDays, getListing, getTakenRanges, type ListingDetail } from "./load";

export interface PricedStay {
  detail: ListingDetail;
  days: CalendarDay[];
  availability: AvailabilityResult;
  /** Null when the stay is unavailable or any night is unpriced. */
  quote: Quote | null;
}

export async function priceStay(
  listingId: string,
  stay: StayRequest,
  /** `exceptBookingId`: price an existing request's own dates (counter-offer, extension) despite its own hold. */
  opts: { orgId?: string | null; exceptBookingId?: string | null } = {},
): Promise<PricedStay | null> {
  const detail = await getListing(listingId);
  if (!detail) return null;
  const l = detail.listing;

  // Include the check-out day so closed_on_departure can be evaluated.
  const [synced, taken, rateCard] = await Promise.all([
    getCalendarDays(listingId, stay.checkIn, addDays(stay.checkOut, 0)),
    getTakenRanges(listingId, stay.checkIn, stay.checkOut, opts.exceptBookingId ?? null),
    opts.orgId ? effectiveRateCard(opts.orgId, stay.checkIn) : Promise.resolve(null),
  ]);
  // Nights another request holds, or a booking the calendar has not caught up with, are not available here either
  // (the property page's picker refuses them on the same data). A hold blocks the whole listing even when it has
  // several units: the submission's exclusion constraint does the same.
  const days = synced.map((d) =>
    taken.some((r) => d.date >= r.start && d.date < r.end)
      ? { ...d, isAvailable: false, allotment: null, status: "pending" as const }
      : d,
  );
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
      rateCard,
      policy: { midStayClean: null, taxRules: PLACEHOLDER_TAX_RULES }, // TODO(week-3): settings-table pricing policy
    });
  }

  return { detail, days, availability, quote };
}
