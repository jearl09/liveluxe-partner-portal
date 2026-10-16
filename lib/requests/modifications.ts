/**
 * Post-confirmation changes to a stay — spec §10.6 (extension, early departure),
 * §6.7 "Update reservation" (never shorten a stay without an explicit approved
 * modification record), §17.2 "Partial refund needed (early departure)".
 *
 *   extension        partner asks for more nights → the system quotes ONLY the new
 *                    nights, checks availability (cached, then live at approval) → ops
 *                    approve → Hostaway reservation updated → booking dates/total updated
 *                    (the exclusion constraint re-engages) → supplementary invoice → email.
 *                    Unavailable → the nearest suitable alternatives are surfaced with a
 *                    relocation note and the request is recorded as declined.
 *   early departure  partner asks to leave early → refund pre-filled from the policy
 *                    (unused nights × retention for the notice given), editable by ops with a
 *                    mandatory reason → Hostaway updated → booking shortened → Stripe refund
 *                    → credit note when invoiced → email with the calculation.
 *
 * Every modification is its own row in booking_modifications; money steps are
 * idempotent on that row's id.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingModificationRow, BookingRequestRow, InvoiceRow } from "@/lib/db/types";
import { resolveAvailability } from "@/lib/domain/availability";
import { retentionPctFor } from "@/lib/domain/cancellation";
import { daysBetween, isIsoDate, todayIn } from "@/lib/domain/dates";
import { DomainError } from "@/lib/domain/errors";
import { partnerPropertyName } from "@/lib/domain/property-name";
import { formatMoney } from "@/lib/domain/money";
import { assertRefundable, earlyDepartureRefund, invoiceDaysFor, invoiceItemsFromQuote } from "@/lib/domain/payments";
import type { SessionClaims } from "@/lib/domain/permissions";
import { can, isLivluxeRole } from "@/lib/domain/permissions";
import type { QuoteLine } from "@/lib/domain/quote-engine";
import { hostaway } from "@/lib/hostaway/api";
import { mapCalendarDay } from "@/lib/hostaway/mappers";
import { updateHostawayReservationDates } from "@/lib/hostaway/reservations";
import { priceStay } from "@/lib/listings/price";
import { slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { loadOrgBilling } from "@/lib/payments/customers";
import { latestPayment } from "@/lib/payments/intents";
import { invoiceForBooking, issueSupplementaryInvoice } from "@/lib/payments/invoices";
import { sendModificationDecided } from "@/lib/payments/notify";
import {
  creditInvoiceForCancellation,
  refundBookingPayment,
  refundKeys,
  refundsForBooking,
  refundedSoFar,
} from "@/lib/payments/refunds";
import { BOOKING_TZ, loadCancellationPolicy } from "./cancel";
import { getRequest, type RequestDetail } from "./load";

export const MODIFIABLE_STATUSES = ["CONFIRMED", "CHECKED_IN"] as const;

export async function modificationsForBooking(bookingId: string): Promise<BookingModificationRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("booking_modifications")
    .select("*")
    .eq("booking_id", bookingId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(`booking_modifications read failed: ${error.message}`);
  return data ?? [];
}

async function loadModifiable(claims: SessionClaims, id: string): Promise<RequestDetail> {
  const d = await getRequest(id);
  if (!d) throw new DomainError("NOT_FOUND", { id });
  if (d.request.org_id !== claims.org_id && !isLivluxeRole(claims.role)) throw new DomainError("FORBIDDEN");
  if (!(MODIFIABLE_STATUSES as readonly string[]).includes(d.request.status))
    throw new DomainError("INVALID_MODIFICATION", { detail: "Only a confirmed booking can be changed." });
  return d;
}

async function partnerUserId(claims: SessionClaims): Promise<string | null> {
  const { data } = await adminDb().from("partner_users").select("id").eq("auth_user_id", claims.sub).maybeSingle();
  return data?.id ?? null;
}

export interface Alternative {
  listingId: string;
  name: string;
  suburb: string | null;
  note: string;
}

/** §10.6: when the property cannot take the extra nights, the nearest suitable alternatives with a relocation note. */
export async function alternativesFor(d: RequestDetail, from: string, to: string): Promise<Alternative[]> {
  const supabase = await createServerSupabase();
  const r = d.request;
  const { data } = await supabase.rpc("search_available_listings", {
    p_check_in: from,
    p_check_out: to,
    p_guests: r.guests_adults + r.guests_children,
    p_pets: r.guests_pets,
  });
  const rows = (data ?? []).filter((l) => l.id !== r.listing_id);
  const sameSuburb = rows.filter((l) => l.suburb && l.suburb === d.listing.suburb);
  const pick = [...sameSuburb, ...rows.filter((l) => !sameSuburb.includes(l))].slice(0, 3);
  return pick.map((l) => ({
    listingId: l.id,
    name: partnerPropertyName(l.public_name, (l as { internal_name?: string | null }).internal_name),
    suburb: l.suburb,
    note: `Available ${from} → ${to}; a relocation on ${from} would be arranged by Live Luxe.`,
  }));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export interface ExtensionQuote {
  available: boolean;
  nights: number;
  totalCents: number;
  lines: QuoteLine[];
  taxCents: number;
  alternatives: Alternative[];
}

/** Quote only the new nights [current check-out, new check-out). */
export async function quoteExtension(d: RequestDetail, newCheckOut: string): Promise<ExtensionQuote> {
  const r = d.request;
  if (!isIsoDate(newCheckOut) || daysBetween(r.check_out, newCheckOut) < 1)
    throw new DomainError("VALIDATION_FAILED", { detail: "The new check-out must be after the current one." });
  const priced = await priceStay(
    r.listing_id,
    {
      checkIn: r.check_out,
      checkOut: newCheckOut,
      adults: r.guests_adults,
      children: r.guests_children,
      pets: r.guests_pets,
    },
    { orgId: r.org_id, exceptBookingId: r.id },
  );
  const nights = daysBetween(r.check_out, newCheckOut);
  if (!priced || !priced.availability.available || !priced.quote) {
    return {
      available: false,
      nights,
      totalCents: 0,
      lines: [],
      taxCents: 0,
      alternatives: await alternativesFor(d, r.check_out, newCheckOut),
    };
  }
  // The extension is accommodation only: the cleaning fee was already charged with the original stay.
  const lines = priced.quote.lines.filter((l) => l.kind !== "cleaning_fee");
  const taxLine = lines.find((l) => l.kind === "tax");
  const subtotal = lines.filter((l) => l.kind !== "tax").reduce((s, l) => s + l.amountCents, 0);
  const totalCents = subtotal + (taxLine?.amountCents ?? 0);
  return {
    available: true,
    nights,
    totalCents,
    lines,
    taxCents: taxLine?.amountCents ?? priced.quote.taxCents,
    alternatives: [],
  };
}

export async function requestExtension(
  claims: SessionClaims,
  id: string,
  input: { newCheckOut: string; reason: string },
  requestId: string,
): Promise<{ modification: BookingModificationRow; quote: ExtensionQuote }> {
  if (!can(claims.role, "requests.submit")) throw new DomainError("FORBIDDEN");
  const d = await loadModifiable(claims, id);
  const r = d.request;
  const quote = await quoteExtension(d, input.newCheckOut);
  const by = await partnerUserId(claims);
  const db = adminDb();
  const { data: row, error } = await db
    .from("booking_modifications")
    .insert({
      booking_id: r.id,
      kind: "extension",
      status: quote.available ? "requested" : "declined",
      requested_by: by,
      old_check_in: r.check_in,
      old_check_out: r.check_out,
      new_check_in: r.check_in,
      new_check_out: input.newCheckOut,
      delta_cents: quote.totalCents,
      reason: input.reason.slice(0, 500) || null,
      decision_note: quote.available ? null : "Property unavailable for the additional nights; alternatives surfaced.",
      alternatives: quote.available ? null : (quote.alternatives as never),
      decided_at: quote.available ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !row) throw new Error(`booking_modifications insert failed: ${error?.message}`);
  log.info("booking.extension_requested", {
    requestId,
    reference: r.reference,
    nights: quote.nights,
    available: quote.available,
  });
  if (quote.available)
    await slack(
      "bookings",
      `:calendar: ${r.reference} extension requested: ${quote.nights} night(s) to ${input.newCheckOut} (${formatMoney(quote.totalCents, r.currency)}). Decide at /admin/bookings/${r.id}.`,
    );
  if (!quote.available)
    throw new DomainError("EXTENSION_UNAVAILABLE", { alternatives: quote.alternatives, modificationId: row.id });
  return { modification: row, quote };
}

async function assertLiveForNights(d: RequestDetail, from: string, to: string, requestId: string) {
  const r = d.request;
  const res = await hostaway.getCalendar(d.listing.hostawayListingId, from, to, "interactive");
  if (!res.ok) {
    log.error("booking.extension.hostaway_unavailable", { requestId, reference: r.reference, code: res.code });
    throw new DomainError("HOSTAWAY_UNAVAILABLE", { code: res.code });
  }
  const availability = resolveAvailability(
    res.data.map(mapCalendarDay),
    { minNights: 1, maxNights: null, maxGuests: d.listing.maxGuests ?? 0, maxPets: d.listing.maxPets },
    { checkIn: from, checkOut: to, adults: r.guests_adults, children: r.guests_children, pets: r.guests_pets },
  );
  if (!availability.available)
    throw new DomainError("EXTENSION_UNAVAILABLE", {
      reason: availability.reason,
      conflictingDates: [...availability.missingDates, ...availability.unavailableDates],
      source: "hostaway_live",
    });
}

async function loadModification(modificationId: string): Promise<BookingModificationRow> {
  const { data, error } = await adminDb()
    .from("booking_modifications")
    .select("*")
    .eq("id", modificationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new DomainError("NOT_FOUND", { modificationId });
  return data;
}

async function finishModification(
  mod: BookingModificationRow,
  patch: Partial<BookingModificationRow>,
): Promise<BookingModificationRow> {
  const { data, error } = await adminDb()
    .from("booking_modifications")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", mod.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`booking_modifications update failed: ${error?.message}`);
  return data;
}

/** Shrink or grow the booking's stay; the DB exclusion constraint is the last line of defence. */
async function applyDates(
  b: BookingRequestRow,
  newCheckOut: string,
  newTotalCents: number,
  requestId: string,
): Promise<BookingRequestRow> {
  const { data, error } = await adminDb()
    .from("booking_requests")
    .update({ check_out: newCheckOut, total_cents: newTotalCents })
    .eq("id", b.id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23P01") throw new DomainError("EXTENSION_UNAVAILABLE", { source: "exclusion_constraint" });
    throw new Error(`booking dates update failed: ${error.message}`);
  }
  await adminDb()
    .from("audit_log")
    .insert({
      actor_type: "livluxe",
      action: "booking.dates_modified",
      entity_type: "booking_request",
      entity_id: b.id,
      before: { check_out: b.check_out, total_cents: b.total_cents } as never,
      after: { check_out: newCheckOut, total_cents: newTotalCents } as never,
      request_id: requestId,
    });
  return data!;
}

export async function approveExtension(
  claims: SessionClaims,
  modificationId: string,
  note: string,
  requestId: string,
): Promise<BookingModificationRow> {
  if (!can(claims.role, "requests.approve")) throw new DomainError("FORBIDDEN");
  const mod = await loadModification(modificationId);
  if (mod.kind !== "extension" || mod.status !== "requested")
    throw new DomainError("INVALID_MODIFICATION", { status: mod.status });
  const d = await loadModifiable(claims, mod.booking_id);
  const r = d.request;
  if (r.check_out !== mod.old_check_out)
    throw new DomainError("INVALID_MODIFICATION", { detail: "The booking's dates changed since this was requested." });

  // Re-quote and live re-check the new nights only (§6.7 "Update reservation").
  const quote = await quoteExtension(d, mod.new_check_out);
  if (!quote.available) {
    await finishModification(mod, {
      status: "declined",
      decided_by: await partnerUserId(claims),
      decided_at: new Date().toISOString(),
      decision_note: "No longer available.",
      alternatives: quote.alternatives as never,
    });
    throw new DomainError("EXTENSION_UNAVAILABLE", { alternatives: quote.alternatives });
  }
  await assertLiveForNights(d, r.check_out, mod.new_check_out, requestId);

  // Hostaway first, then our dates, then money (§6.7 ordering).
  const ha = await updateHostawayReservationDates(
    r,
    { checkIn: r.check_in, checkOut: mod.new_check_out },
    mod.id,
    requestId,
  );
  if (ha.status === "failed") {
    await finishModification(mod, { status: "failed", hostaway_status: "failed", hostaway_error: ha.reason });
    throw new DomainError("HOSTAWAY_UNAVAILABLE", { code: ha.reason });
  }
  const newTotal = (r.total_cents ?? 0) + quote.totalCents;
  const updated = await applyDates(r, mod.new_check_out, newTotal, requestId);

  const org = await loadOrgBilling(r.org_id);
  let invoice: InvoiceRow | null = null;
  try {
    invoice = await issueSupplementaryInvoice(
      { booking: updated, org, propertyName: d.listing.name, quote: null },
      {
        modificationId: mod.id,
        items: invoiceItemsFromQuote(quote.lines, quote.taxCents),
        nights: quote.nights,
        newCheckOut: mod.new_check_out,
        daysUntilDue: invoiceDaysFor(org.payment_terms) || 7,
      },
    );
  } catch (e) {
    log.error("stripe.invoice.supplementary_failed", { requestId, reference: r.reference, error: String(e) });
    await slack(
      "alerts",
      `:warning: ${r.reference} extension approved but the supplementary invoice failed: ${String(e).slice(0, 200)}`,
    );
  }

  const done = await finishModification(mod, {
    status: "approved",
    decided_by: await partnerUserId(claims),
    decided_at: new Date().toISOString(),
    decision_note: note.slice(0, 500) || null,
    delta_cents: quote.totalCents,
    hostaway_status: ha.status,
    invoice_id: invoice?.id ?? null,
  });
  await sendModificationDecided(
    updated,
    d.listing.name,
    {
      modificationId: mod.id,
      kind: "extension",
      approved: true,
      newCheckOut: mod.new_check_out,
      moneyLabel: `${formatMoney(quote.totalCents, r.currency)} for ${quote.nights} additional night(s)${invoice ? `, invoice ${invoice.number ?? ""} ${invoice.due_at ? `due ${invoice.due_at.slice(0, 10)}` : ""}`.trimEnd() : ""}.`,
      note: note || null,
      invoiceUrl: invoice?.hosted_url ?? null,
    },
    requestId,
  );
  await slack(
    "bookings",
    `:white_check_mark: ${r.reference} extended to ${mod.new_check_out} (+${formatMoney(quote.totalCents, r.currency)})${ha.status === "skipped" ? " · Hostaway update skipped (writes disabled here)" : ""}.`,
  );
  return done;
}

// ---------------------------------------------------------------------------
// Early departure
// ---------------------------------------------------------------------------

export interface EarlyDepartureQuote {
  unusedNights: number;
  unusedCents: number;
  retainPct: number;
  retainedCents: number;
  refundCents: number;
  maxRefundableCents: number;
}

export async function quoteEarlyDeparture(d: RequestDetail, newCheckOut: string): Promise<EarlyDepartureQuote> {
  const r = d.request;
  const today = todayIn(BOOKING_TZ);
  if (!isIsoDate(newCheckOut) || daysBetween(r.check_in, newCheckOut) < 1 || daysBetween(newCheckOut, r.check_out) < 1)
    throw new DomainError("VALIDATION_FAILED", {
      detail: "The new check-out must be after check-in and before the current check-out.",
    });
  if (daysBetween(today, newCheckOut) < 0)
    throw new DomainError("VALIDATION_FAILED", { detail: "The new check-out cannot be in the past." });
  const policy = await loadCancellationPolicy();
  const retainPct = retentionPctFor(daysBetween(today, newCheckOut), policy);
  const calc = earlyDepartureRefund({
    totalCents: r.total_cents ?? 0,
    nights: r.nights,
    oldCheckOut: r.check_out,
    newCheckOut,
    retainPct,
  });
  const payment = await latestPayment(r.id);
  const captured = payment?.status === "succeeded" ? payment.amount_captured_cents : 0;
  const already = refundedSoFar(await refundsForBooking(r.id));
  const maxRefundableCents = Math.max(0, captured - already);
  return { ...calc, retainPct, refundCents: Math.min(calc.refundCents, maxRefundableCents), maxRefundableCents };
}

export async function requestEarlyDeparture(
  claims: SessionClaims,
  id: string,
  input: { newCheckOut: string; reason: string },
  requestId: string,
): Promise<{ modification: BookingModificationRow; quote: EarlyDepartureQuote }> {
  if (!can(claims.role, "requests.cancel")) throw new DomainError("FORBIDDEN");
  const d = await loadModifiable(claims, id);
  const r = d.request;
  const quote = await quoteEarlyDeparture(d, input.newCheckOut);
  const { data: row, error } = await adminDb()
    .from("booking_modifications")
    .insert({
      booking_id: r.id,
      kind: "early_departure",
      status: "requested",
      requested_by: await partnerUserId(claims),
      old_check_in: r.check_in,
      old_check_out: r.check_out,
      new_check_in: r.check_in,
      new_check_out: input.newCheckOut,
      delta_cents: -quote.refundCents,
      reason: input.reason.slice(0, 500) || null,
    })
    .select("*")
    .single();
  if (error || !row) throw new Error(`booking_modifications insert failed: ${error?.message}`);
  await slack(
    "bookings",
    `:door: ${r.reference} early departure requested: leave ${input.newCheckOut} (${quote.unusedNights} unused night(s); policy refund ${formatMoney(quote.refundCents, r.currency)}). Decide at /admin/bookings/${r.id}.`,
  );
  return { modification: row, quote };
}

/**
 * Ops approve an early departure (§17.2 "Partial refund needed"): the policy amount is
 * pre-filled; finance may override with a mandatory reason; anything above the maximum
 * refundable is rejected before Stripe.
 */
export async function approveEarlyDeparture(
  claims: SessionClaims,
  modificationId: string,
  input: { overrideRefundCents: number | null; note: string },
  requestId: string,
): Promise<BookingModificationRow> {
  if (!can(claims.role, "requests.approve")) throw new DomainError("FORBIDDEN");
  const mod = await loadModification(modificationId);
  if (mod.kind !== "early_departure" || mod.status !== "requested")
    throw new DomainError("INVALID_MODIFICATION", { status: mod.status });
  const d = await loadModifiable(claims, mod.booking_id);
  const r = d.request;
  const quote = await quoteEarlyDeparture(d, mod.new_check_out);

  let refundCents = quote.refundCents;
  if (input.overrideRefundCents != null) {
    if (!can(claims.role, "refunds.issue"))
      throw new DomainError("FORBIDDEN", { detail: "Only finance may change the refund amount." });
    if (!input.note.trim())
      throw new DomainError("VALIDATION_FAILED", {
        detail: "A reason is required when the refund differs from the policy.",
      });
    assertRefundable({
      requestedCents: input.overrideRefundCents,
      capturedCents: quote.maxRefundableCents + refundedSoFar(await refundsForBooking(r.id)),
      alreadyRefundedCents: refundedSoFar(await refundsForBooking(r.id)),
      refundsFrozen: !!r.refunds_frozen_at,
    });
    refundCents = Math.round(input.overrideRefundCents);
  }
  if (refundCents > 0 && r.refunds_frozen_at) throw new DomainError("REFUNDS_FROZEN");

  // Hostaway first, then our dates, then money (§6.7 ordering).
  const ha = await updateHostawayReservationDates(
    r,
    { checkIn: r.check_in, checkOut: mod.new_check_out },
    mod.id,
    requestId,
  );
  if (ha.status === "failed") {
    await finishModification(mod, { status: "failed", hostaway_status: "failed", hostaway_error: ha.reason });
    throw new DomainError("HOSTAWAY_UNAVAILABLE", { code: ha.reason });
  }
  // The booking's total becomes what the partner ends up paying: the original less the refund.
  const updated = await applyDates(r, mod.new_check_out, Math.max(0, (r.total_cents ?? 0) - refundCents), requestId);

  const reason = `Early departure on ${mod.new_check_out}${input.note ? `: ${input.note}` : ""}`;
  const payment = await latestPayment(r.id);
  const refund = await refundBookingPayment({
    bookingId: r.id,
    bookingReference: r.reference,
    payment,
    amountCents: refundCents,
    reason,
    approvedBy: await partnerUserId(claims),
    idempotencyKey: refundKeys.modification(mod.id),
    refundsFrozen: !!r.refunds_frozen_at,
  });
  if (!refund.ok && refund.code === "stripe_error")
    await slack(
      "alerts",
      `:rotating_light: Early-departure refund of ${formatMoney(refundCents, r.currency)} for ${r.reference} failed: ${refund.message}. Finance to process manually.`,
    );
  const invoice = await invoiceForBooking(r.id);
  const credit = await creditInvoiceForCancellation({
    invoice,
    bookingReference: r.reference,
    refundCents,
    retainedCents: (invoice?.amount_due_cents ?? 0) - refundCents,
    stripeRefundId: refund.ok ? (refund.row?.stripe_refund_id ?? null) : null,
    reason,
  });

  const done = await finishModification(mod, {
    status: "approved",
    decided_by: await partnerUserId(claims),
    decided_at: new Date().toISOString(),
    decision_note: input.note.slice(0, 500) || null,
    delta_cents: -refundCents,
    hostaway_status: ha.status,
    refund_id: refund.ok ? (refund.row?.id ?? null) : null,
  });
  const money =
    refundCents > 0
      ? `${formatMoney(refundCents, r.currency)} refunded for ${quote.unusedNights} unused night(s) (${quote.retainPct}% retained under the cancellation policy)${refund.ok ? "; it appears in 5–10 business days" : " — Live Luxe finance is processing it"}.`
      : `No refund: ${quote.retainPct}% of the unused nights is retained under the cancellation policy.`;
  await sendModificationDecided(
    updated,
    d.listing.name,
    {
      modificationId: mod.id,
      kind: "early_departure",
      approved: true,
      newCheckOut: mod.new_check_out,
      moneyLabel: money,
      note: input.note || null,
      invoiceUrl: null,
    },
    requestId,
  );
  await slack(
    "bookings",
    `:door: ${r.reference} early departure approved: out ${mod.new_check_out}, refund ${formatMoney(refundCents, r.currency)}${credit.creditNoteId ? " · credit note issued" : ""}${ha.status === "skipped" ? " · Hostaway update skipped (writes disabled here)" : ""}.`,
  );
  return done;
}

export async function declineModification(
  claims: SessionClaims,
  modificationId: string,
  note: string,
  requestId: string,
): Promise<BookingModificationRow> {
  if (!can(claims.role, "requests.approve")) throw new DomainError("FORBIDDEN");
  const mod = await loadModification(modificationId);
  if (mod.status !== "requested") throw new DomainError("INVALID_MODIFICATION", { status: mod.status });
  const d = await getRequest(mod.booking_id);
  const done = await finishModification(mod, {
    status: "declined",
    decided_by: await partnerUserId(claims),
    decided_at: new Date().toISOString(),
    decision_note: note.slice(0, 500) || null,
  });
  if (d)
    await sendModificationDecided(
      d.request,
      d.listing.name,
      {
        modificationId: mod.id,
        kind: mod.kind === "extension" ? "extension" : "early_departure",
        approved: false,
        newCheckOut: mod.new_check_out,
        moneyLabel: "No change.",
        note: note || null,
        invoiceUrl: null,
      },
      requestId,
    );
  return done;
}
