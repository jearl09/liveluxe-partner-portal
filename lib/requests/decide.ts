/**
 * Decisions on a booking request — spec §10.1, §13.4, Appendix B.
 *
 * Every change: validate the transition with the pure state machine → call the
 * atomic apply_booking_transition() function. Approval additionally re-checks live
 * availability against Hostaway (interactive priority) before engaging the
 * exclusion constraint, so a stale calendar can never produce a double booking.
 * Approval is also gated on payment (§11.1): a card hold for mode A, the credit
 * limit for mode C. Decline and withdrawal void any uncaptured hold.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingRequestRow, DeclineReasonDb } from "@/lib/db/types";
import { resolveAvailability } from "@/lib/domain/availability";
import { assertTransition, type ActorType, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { DomainError } from "@/lib/domain/errors";
import { formatMoney } from "@/lib/domain/money";
import { approvalPaymentGate, creditCheck, paymentModeFor, withinApprovalCeiling } from "@/lib/domain/payments";
import type { SessionClaims } from "@/lib/domain/permissions";
import { can, isLivluxeRole } from "@/lib/domain/permissions";
import {
  applyOpsAdjustment,
  DEFAULT_LONG_STAY_TERMS_FROM_NIGHTS,
  parseLongStayFromNights,
  validateStayTerms,
  type CounterOfferInput,
} from "@/lib/domain/requests";
import { approvalConfigBlock } from "@/lib/env";
import { hostaway } from "@/lib/hostaway/api";
import { mapCalendarDay } from "@/lib/hostaway/mappers";
import { priceStay } from "@/lib/listings/price";
import { log } from "@/lib/observability/logger";
import { loadOrgBilling } from "@/lib/payments/customers";
import { voidBookingAuthorisations } from "@/lib/payments/intents";
import { outstandingInvoiceCents } from "@/lib/payments/invoices";
import { orgPaymentTerms, paymentViewForBooking } from "@/lib/payments/load";
import { rpcErrorToDomain } from "./errors";
import { getRequest } from "./load";

const actorOf = (claims: SessionClaims): ActorType => (isLivluxeRole(claims.role) ? "livluxe" : "partner");

export async function transition(
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

/** §11.1: mode A needs a live card hold; mode C must fit the credit limit. */
async function assertPaymentSecured(detail: NonNullable<Awaited<ReturnType<typeof getRequest>>>) {
  const r = detail.request;
  const mode = paymentModeFor(await orgPaymentTerms(r.org_id));
  if (mode === "invoice") {
    const [org, outstanding] = await Promise.all([loadOrgBilling(r.org_id), outstandingInvoiceCents(r.org_id)]);
    const check = creditCheck({
      outstandingCents: outstanding,
      newCents: r.total_cents ?? 0,
      limitCents: org.credit_limit_cents,
    });
    if (!check.ok)
      throw new DomainError("CREDIT_LIMIT_EXCEEDED", {
        detail: `Outstanding ${formatMoney(outstanding, r.currency)}; ${formatMoney(check.remainingCents ?? 0, r.currency)} of the limit remains.`,
      });
    return;
  }
  const view = await paymentViewForBooking(r.id);
  const gate = approvalPaymentGate(mode, view.state);
  if (!gate.ok) throw new DomainError("PAYMENT_NOT_AUTHORISED", { detail: gate.reason });
}

/** §10.5 value ceiling and §17.2 finance routing: both enforced server-side, not just in the UI. */
async function assertMayApprove(claims: SessionClaims, r: BookingRequestRow) {
  const finance = claims.role === "livluxe_finance" || claims.role === "livluxe_admin";
  if (r.finance_approval_required && !finance)
    throw new DomainError("FINANCE_APPROVAL_REQUIRED", { detail: r.finance_approval_reason ?? undefined });
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "approval.ops_value_ceiling_cents")
    .maybeSingle();
  const ceiling = data?.value == null ? null : Number(data.value);
  if (
    !withinApprovalCeiling({
      role: claims.role,
      totalCents: r.total_cents,
      ceilingCents: Number.isFinite(ceiling) ? ceiling : null,
    })
  )
    throw new DomainError("APPROVAL_VALUE_CEILING", {
      detail: `Bookings above ${formatMoney(ceiling!, r.currency)} must be approved by Live Luxe finance.`,
    });
}

export async function approve(
  claims: SessionClaims,
  id: string,
  requestId: string,
  opts: { stayTerms?: string | null; longStayFromNights?: number } = {},
): Promise<BookingRequestRow> {
  // Before anything changes: live Stripe with Hostaway writes off would take real money for no reservation.
  const blocked = approvalConfigBlock();
  if (blocked) {
    log.error("booking.approve.blocked_by_config", { requestId, id, reason: blocked });
    throw new DomainError("APPROVAL_BLOCKED_CONFIG", { detail: blocked });
  }
  let d = await loadForOps(claims, id);
  // Terms for the stay: optional for short stays, mandatory from `stay.long_stay_terms_from_nights`.
  const terms = validateStayTerms(
    opts.stayTerms !== undefined ? opts.stayTerms : d.request.stay_terms,
    d.request.nights,
    opts.longStayFromNights ?? DEFAULT_LONG_STAY_TERMS_FROM_NIGHTS,
  );
  if (!terms.ok) throw new DomainError("VALIDATION_FAILED", { reason: terms.error });
  if (terms.value !== (d.request.stay_terms ?? null)) {
    const { error } = await adminDb().from("booking_requests").update({ stay_terms: terms.value }).eq("id", id);
    if (error) throw new Error(`stay_terms update failed: ${error.message}`);
  }
  if (d.request.status === "SUBMITTED") {
    await transition(claims, d.request, "UNDER_REVIEW", { reason: "review started" });
    d = (await getRequest(id))!;
  }
  if (d.request.status !== "UNDER_REVIEW")
    throw new DomainError("INVALID_STATE_TRANSITION", { from: d.request.status, to: "APPROVED" });
  await assertMayApprove(claims, d.request);
  await assertPaymentSecured(d);
  await assertLiveAvailability(d, requestId);
  return transition(claims, d.request, "APPROVED", {
    reason: "approved",
    metadata: {
      liveCheck: "hostaway",
      ...(terms.value ? { stayTerms: terms.value } : {}),
      ...(d.request.finance_approval_required ? { financeApprovedBy: claims.sub } : {}),
    },
  });
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
  const row = await transition(claims, d.request, "DECLINED", {
    reason: input.notes || null,
    declineReason: input.reason,
  });
  await voidBookingAuthorisations(id, "declined");
  return row;
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

  const priced = await priceStay(r.listing_id, stay, { orgId: r.org_id, exceptBookingId: r.id });
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

  // Terms for the stay travel with the quote (validated by validateCounterOffer against the new nights).
  if (input.stayTerms !== undefined && input.stayTerms !== (r.stay_terms ?? null)) {
    const { error } = await adminDb().from("booking_requests").update({ stay_terms: input.stayTerms }).eq("id", r.id);
    if (error) throw new Error(`stay_terms update failed: ${error.message}`);
  }

  return transition(claims, r, "COUNTER_OFFERED", {
    reason: input.message,
    metadata: {
      message: input.message,
      ...(input.stayTerms !== undefined ? { stayTerms: input.stayTerms } : {}),
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
  if (accept) return transition(claims, d.request, "UNDER_REVIEW", { reason: "counter-offer accepted" });
  const row = await transition(claims, d.request, "CANCELLED", { reason: "counter-offer declined by partner" });
  await voidBookingAuthorisations(id, "withdrawn by partner");
  return row;
}

export async function loadPolicy(): Promise<{ holdDurationHours: number }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("request_policy");
  return { holdDurationHours: Number(data?.[0]?.hold_duration_hours ?? 48) };
}

/** settings `stay.long_stay_terms_from_nights` (default 28): from this many nights the quote must carry terms. */
export async function loadLongStayFromNights(): Promise<number> {
  const { data } = await adminDb()
    .from("settings")
    .select("value")
    .eq("key", "stay.long_stay_terms_from_nights")
    .maybeSingle();
  return parseLongStayFromNights(data?.value);
}
