/**
 * Decisions on a booking request — spec §10.1, §13.4, Appendix B.
 *
 * Every change: validate the transition with the pure state machine → call the
 * atomic apply_booking_transition() function. Approval additionally re-checks live
 * availability against Hostaway (interactive priority) before engaging the
 * exclusion constraint, so a stale calendar can never produce a double booking.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingRequestRow, DeclineReasonDb } from "@/lib/db/types";
import { resolveAvailability } from "@/lib/domain/availability";
import { assertTransition, type ActorType, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { DomainError } from "@/lib/domain/errors";
import type { SessionClaims } from "@/lib/domain/permissions";
import { can, isLivluxeRole } from "@/lib/domain/permissions";
import { applyOpsAdjustment, type CounterOfferInput } from "@/lib/domain/requests";
import { hostaway } from "@/lib/hostaway/api";
import { mapCalendarDay } from "@/lib/hostaway/mappers";
import { priceStay } from "@/lib/listings/price";
import { log } from "@/lib/observability/logger";
import { rpcErrorToDomain } from "./errors";
import { getRequest } from "./load";

const actorOf = (claims: SessionClaims): ActorType => (isLivluxeRole(claims.role) ? "livluxe" : "partner");

async function transition(
  claims: SessionClaims,
  booking: BookingRequestRow,
  to: BookingStatus,
  extra: {
    reason?: string | null;
    declineReason?: DeclineReasonDb | null;
    metadata?: Record<string, unknown> | null;
    newCheckIn?: string | null;
    newCheckOut?: string | null;
    newTotalCents?: number | null;
    newQuoteId?: string | null;
    extendHoldHours?: number | null;
  } = {},
): Promise<BookingRequestRow> {
  assertTransition(booking.status, to, actorOf(claims));
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("apply_booking_transition", {
    p_booking_id: booking.id,
    p_expected_from: booking.status,
    p_to: to,
    p_reason: extra.reason ?? null,
    p_decline_reason: extra.declineReason ?? null,
    p_metadata: (extra.metadata ?? null) as never,
    p_new_check_in: extra.newCheckIn ?? null,
    p_new_check_out: extra.newCheckOut ?? null,
    p_new_total_cents: extra.newTotalCents ?? null,
    p_new_quote_id: extra.newQuoteId ?? null,
    p_extend_hold_hours: extra.extendHoldHours ?? null,
  });
  if (error) throw rpcErrorToDomain(error);
  log.info("booking.transition", { userId: claims.sub, reference: booking.reference, from: booking.status, to });
  return data as BookingRequestRow;
}

async function loadForOps(claims: SessionClaims, id: string) {
  if (!can(claims.role, "requests.approve")) throw new DomainError("FORBIDDEN");
  const detail = await getRequest(id);
  if (!detail) throw new DomainError("NOT_FOUND", { id });
  return detail;
}

/** SUBMITTED → UNDER_REVIEW (assigns the caller). No-op if already under review. */
export async function startReview(claims: SessionClaims, id: string): Promise<BookingRequestRow> {
  const d = await loadForOps(claims, id);
  if (d.request.status === "UNDER_REVIEW") return d.request;
  return transition(claims, d.request, "UNDER_REVIEW", { reason: "review started" });
}

/** Live re-check against Hostaway for the exact stay (§6.4.2, §10.1 APPROVED side-effects). */
async function assertLiveAvailability(detail: NonNullable<Awaited<ReturnType<typeof getRequest>>>, requestId: string) {
  const r = detail.request;
  const res = await hostaway.getCalendar(detail.listing.hostawayListingId, r.check_in, r.check_out, "interactive");
  if (!res.ok) {
    log.error("booking.approve.hostaway_unavailable", { requestId, reference: r.reference, code: res.code });
    throw new DomainError("HOSTAWAY_UNAVAILABLE", { code: res.code });
  }
  const days = res.data.map(mapCalendarDay);
  const availability = resolveAvailability(
    days,
    {
      minNights: detail.listing.minNights,
      maxNights: detail.listing.maxNights,
      maxGuests: detail.listing.maxGuests ?? 0,
      maxPets: detail.listing.maxPets,
    },
    {
      checkIn: r.check_in,
      checkOut: r.check_out,
      adults: r.guests_adults,
      children: r.guests_children,
      pets: r.guests_pets,
    },
  );
  if (!availability.available) {
    throw new DomainError("DATES_UNAVAILABLE", {
      reason: availability.reason,
      conflictingDates: [...availability.missingDates, ...availability.unavailableDates],
      source: "hostaway_live",
    });
  }
}

export async function approve(claims: SessionClaims, id: string, requestId: string): Promise<BookingRequestRow> {
  let d = await loadForOps(claims, id);
  if (d.request.status === "SUBMITTED") {
    await transition(claims, d.request, "UNDER_REVIEW", { reason: "review started" });
    d = (await getRequest(id))!;
  }
  if (d.request.status !== "UNDER_REVIEW")
    throw new DomainError("INVALID_STATE_TRANSITION", { from: d.request.status, to: "APPROVED" });
  await assertLiveAvailability(d, requestId);
  return transition(claims, d.request, "APPROVED", { reason: "approved", metadata: { liveCheck: "hostaway" } });
}

export async function decline(
  claims: SessionClaims,
  id: string,
  input: { reason: DeclineReasonDb; notes: string },
): Promise<BookingRequestRow> {
  let d = await loadForOps(claims, id);
  if (d.request.status === "SUBMITTED") {
    await transition(claims, d.request, "UNDER_REVIEW", { reason: "review started" });
    d = (await getRequest(id))!;
  }
  return transition(claims, d.request, "DECLINED", { reason: input.notes || null, declineReason: input.reason });
}

/** Ops proposes different dates and/or a different total; a new quote row supersedes the old one. */
export async function counterOffer(
  claims: SessionClaims,
  id: string,
  input: CounterOfferInput,
  policy: { holdDurationHours: number },
): Promise<BookingRequestRow> {
  let d = await loadForOps(claims, id);
  if (d.request.status === "SUBMITTED") {
    await transition(claims, d.request, "UNDER_REVIEW", { reason: "review started" });
    d = (await getRequest(id))!;
  }
  const r = d.request;
  const checkIn = input.newCheckIn ?? r.check_in;
  const checkOut = input.newCheckOut ?? r.check_out;
  const stay = { checkIn, checkOut, adults: r.guests_adults, children: r.guests_children, pets: r.guests_pets };

  const priced = await priceStay(r.listing_id, stay);
  if (!priced) throw new DomainError("NOT_FOUND", { listingId: r.listing_id });
  let quote = priced.quote;
  if (!quote) {
    // Unpriced nights: ops is naming the price explicitly, so build a bare quote from the total.
    if (input.newTotalCents === null) throw new DomainError("VALIDATION_FAILED", { reason: "price_on_application" });
    quote = {
      lines: [],
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      nightlyAverageCents: 0,
      nights: priced.availability.nights,
      securityDepositCents: priced.detail.listing.security_deposit_cents,
      rateCardId: null,
      rateCardVersion: null,
      priceHash: "",
    };
  }
  if (input.newTotalCents !== null)
    quote = applyOpsAdjustment(quote, { listingId: r.listing_id, ...stay }, input.newTotalCents);

  const supabase = await createServerSupabase();
  const { data: inserted, error: qErr } = await supabase
    .from("quotes")
    .insert({
      listing_id: r.listing_id,
      org_id: r.org_id,
      created_by: null,
      check_in: checkIn,
      check_out: checkOut,
      guests_adults: r.guests_adults,
      guests_children: r.guests_children,
      guests_pets: r.guests_pets,
      line_items: quote.lines as never,
      subtotal_cents: quote.subtotalCents,
      tax_cents: quote.taxCents,
      total_cents: quote.totalCents,
      deposit_cents: quote.securityDepositCents,
      currency: priced.detail.listing.currency,
      rate_card_id: quote.rateCardId,
      rate_card_version: quote.rateCardVersion,
      price_hash: quote.priceHash,
      expires_at: new Date(Date.now() + policy.holdDurationHours * 3600_000).toISOString(),
      supersedes_id: r.quote_id,
    })
    .select("id")
    .single();
  if (qErr || !inserted) throw new Error(`counter quote insert failed: ${qErr?.message}`);

  return transition(claims, r, "COUNTER_OFFERED", {
    reason: input.message,
    metadata: {
      message: input.message,
      previousTotalCents: r.total_cents,
      newTotalCents: quote.totalCents,
      previousCheckIn: r.check_in,
      previousCheckOut: r.check_out,
      newCheckIn: checkIn,
      newCheckOut: checkOut,
    },
    newCheckIn: input.newCheckIn,
    newCheckOut: input.newCheckOut,
    newTotalCents: quote.totalCents,
    newQuoteId: inserted.id,
    extendHoldHours: policy.holdDurationHours,
  });
}

/** Partner answers a counter-offer: accept (back to review) or walk away (cancelled). */
export async function respondToCounter(claims: SessionClaims, id: string, accept: boolean): Promise<BookingRequestRow> {
  if (!can(claims.role, "requests.submit")) throw new DomainError("FORBIDDEN");
  const d = await getRequest(id);
  if (!d) throw new DomainError("NOT_FOUND", { id });
  if (d.request.status !== "COUNTER_OFFERED")
    throw new DomainError("INVALID_STATE_TRANSITION", { from: d.request.status });
  return accept
    ? transition(claims, d.request, "UNDER_REVIEW", { reason: "counter-offer accepted" })
    : transition(claims, d.request, "CANCELLED", { reason: "counter-offer declined by partner" });
}

export async function loadPolicy(): Promise<{ holdDurationHours: number }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("request_policy");
  return { holdDurationHours: Number(data?.[0]?.hold_duration_hours ?? 48) };
}
