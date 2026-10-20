/**
 * Withdrawals, cancellations and cancellation requests — spec §10.3, §11.6,
 * Appendix B (CONFIRMED→CANCELLED side effects), §6.7 ordering.
 *
 *   quote      what cancelling now means: policy retention, refund, who may do it
 *   withdraw   partner closes a pending request (nothing captured; hold voided)
 *   cancel     CANCELLED transition → Hostaway reservation cancelled → hold voided
 *              → Stripe refund → credit note / void invoice → notifications
 *   request    inside the cut-off a partner can only ask; ops decide on their page
 *
 * The transition is committed first and the money steps are each idempotent, so
 * a crash halfway leaves a cancelled booking whose refund the ops page can
 * re-run, never a refunded booking that is still live.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingRequestRow, InvoiceRow, PaymentRow, RefundRow } from "@/lib/db/types";
import {
  cancellationQuote,
  cleaningFeeWithTax,
  parseCancellationPolicy,
  type CancellationPolicy,
  type CancellationQuote,
  type CancellationReason,
  CANCELLATION_REASON_LABELS,
} from "@/lib/domain/cancellation";
import { todayIn } from "@/lib/domain/dates";
import { DomainError } from "@/lib/domain/errors";
import { formatMoney } from "@/lib/domain/money";
import { assertRefundable } from "@/lib/domain/payments";
import type { SessionClaims } from "@/lib/domain/permissions";
import { can, isLivluxeRole } from "@/lib/domain/permissions";
import { cancelHostawayReservation } from "@/lib/hostaway/reservations";
import { slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { voidBookingAuthorisations } from "@/lib/payments/intents";
import { paymentViewForBooking } from "@/lib/payments/load";
import { sendBookingCancelled } from "@/lib/payments/notify";
import { creditInvoiceForCancellation, refundBookingPayment } from "@/lib/payments/refunds";
import { transition } from "./decide";
import { getRequest, type RequestDetail } from "./load";

export const BOOKING_TZ = "Australia/Melbourne";

export async function loadCancellationPolicy(): Promise<CancellationPolicy> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("cancellation_policy");
  const row = data?.[0];
  return parseCancellationPolicy(row?.cutoff_days, row?.retention_schedule);
}

export interface CancellationView {
  quote: CancellationQuote | null;
  policy: CancellationPolicy;
  payment: PaymentRow | null;
  invoice: InvoiceRow | null;
  refunds: RefundRow[];
}

/** Everything the cancel panel and the cancel action need, computed the same way for both. */
export async function cancellationView(detail: RequestDetail): Promise<CancellationView> {
  const r = detail.request;
  const [policy, pay] = await Promise.all([loadCancellationPolicy(), paymentViewForBooking(r.id)]);
  const { row: payment, invoice, refunds } = pay;
  const captured = payment?.status === "succeeded" ? payment.amount_captured_cents : 0;
  const alreadyRefunded = refunds
    .filter((x) => x.status !== "failed" && x.status !== "canceled")
    .reduce((s, x) => s + x.amount_cents, 0);
  const quote = cancellationQuote({
    status: r.status,
    checkIn: r.check_in,
    today: todayIn(BOOKING_TZ),
    totalCents: r.total_cents ?? 0,
    capturedCents: Math.max(0, captured - alreadyRefunded),
    policy,
    // The cleaning fee is never retained: no clean happens for a cancelled stay.
    cleaningFeeCents: detail.quote
      ? cleaningFeeWithTax({
          lines: detail.quote.lines,
          subtotalCents: detail.quote.subtotalCents,
          taxCents: detail.quote.taxCents,
        })
      : 0,
  });
  return { quote, policy, payment, invoice, refunds };
}

export interface CancelInput {
  reason: CancellationReason;
  note: string;
  /** Finance/admin only: refund a different amount than the policy says (cents). */
  overrideRefundCents?: number | null;
}

export interface CancelOutcome {
  booking: BookingRequestRow;
  refundCents: number;
  retainedCents: number;
  refundOk: boolean;
  hostaway: string;
  note: string;
}

async function partnerUserId(claims: SessionClaims): Promise<string | null> {
  const { data } = await adminDb().from("partner_users").select("id").eq("auth_user_id", claims.sub).maybeSingle();
  return data?.id ?? null;
}

function reasonText(input: CancelInput): string {
  const label = CANCELLATION_REASON_LABELS[input.reason];
  return input.note ? `${label}: ${input.note}` : label;
}

function moneyLabel(
  b: BookingRequestRow,
  refundCents: number,
  retainedCents: number,
  payment: PaymentRow | null,
  invoice: InvoiceRow | null,
  refundOk: boolean,
): string {
  const money = (c: number) => formatMoney(c, b.currency);
  if (refundCents > 0 && payment) {
    const card = payment.card_last4
      ? `${payment.card_brand ? payment.card_brand[0].toUpperCase() + payment.card_brand.slice(1) : "card"} ending ${payment.card_last4}`
      : "the original card";
    return refundOk
      ? `${money(refundCents)} refunded to ${card}; it appears in 5–10 business days.${retainedCents > 0 ? ` ${money(retainedCents)} retained under the cancellation policy.` : ""}`
      : `${money(refundCents)} is due back to ${card}; Live Luxe finance is processing it.`;
  }
  if (invoice && (invoice.status === "open" || invoice.status === "uncollectible"))
    return retainedCents > 0
      ? `The invoice has been credited; ${money(retainedCents)} remains payable under the cancellation policy.`
      : "The invoice has been voided; nothing is payable.";
  if (retainedCents > 0 && (payment || invoice))
    return `No refund: ${money(retainedCents)} is retained under the cancellation policy.`;
  return "Nothing was charged.";
}

/**
 * Cancel or withdraw. Partners are bound by the cut-off; Live Luxe may cancel at
 * any time and finance/admin may override the refund amount.
 */
export async function cancelBooking(
  claims: SessionClaims,
  id: string,
  input: CancelInput,
  requestId: string,
): Promise<CancelOutcome> {
  if (!can(claims.role, "requests.cancel")) throw new DomainError("FORBIDDEN");
  const d = await getRequest(id);
  if (!d) throw new DomainError("NOT_FOUND", { id });
  const livluxe = isLivluxeRole(claims.role);
  const view = await cancellationView(d);
  const q = view.quote;
  if (!q) throw new DomainError("INVALID_STATE_TRANSITION", { from: d.request.status, to: "CANCELLED" });
  if (!livluxe && !q.selfService) throw new DomainError("CANCELLATION_REQUIRES_APPROVAL");

  let refundCents = q.refundCents;
  let retainedCents = q.retainedCents;
  const alreadyRefunded = view.refunds
    .filter((x) => x.status !== "failed" && x.status !== "canceled")
    .reduce((s, x) => s + x.amount_cents, 0);
  const capturedTotal = view.payment?.status === "succeeded" ? view.payment.amount_captured_cents : 0;
  if (livluxe && input.overrideRefundCents != null && can(claims.role, "refunds.issue")) {
    // §17.2 "Refund exceeds captured amount": rejected here with the maximum, never clamped silently.
    assertRefundable({
      requestedCents: input.overrideRefundCents,
      capturedCents: capturedTotal,
      alreadyRefundedCents: alreadyRefunded,
      refundsFrozen: !!d.request.refunds_frozen_at,
    });
    refundCents = Math.round(input.overrideRefundCents);
    retainedCents = Math.max(0, (d.request.total_cents ?? 0) - refundCents);
  }
  // §17.2 "Chargeback raised": automated refunds are frozen while a dispute is open.
  if (refundCents > 0 && d.request.refunds_frozen_at) throw new DomainError("REFUNDS_FROZEN");
  const reason = reasonText(input);

  // 1. State first: the booking is cancelled whatever happens to the money (§6.7 ordering).
  let b = await transition(claims, d.request, "CANCELLED", {
    reason,
    metadata: {
      kind: q.kind,
      cancellationReason: input.reason,
      daysUntilCheckIn: q.daysUntilCheckIn,
      retainPct: q.retainPct,
      refundCents,
      retainedCents,
      overridden: refundCents !== q.refundCents,
    },
  });

  // 2. Inventory: release the Hostaway reservation before touching money.
  const ha = await cancelHostawayReservation(b, requestId);
  // §8.4: the pack is hidden at once by the status change; if codes were already out, ops must rotate them.
  if (b.checkin_released_at)
    await slack(
      "alerts",
      `:rotating_light: ${b.reference} cancelled after its access pack was released ${b.checkin_released_at}. Rotate the door code and Wi-Fi password for ${d.listing.name} in Hostaway.`,
    );

  // 3. Money: void any uncaptured hold, refund the captured part, keep the tax record straight.
  await voidBookingAuthorisations(b.id, "cancelled");
  const approvedBy = await partnerUserId(claims);
  const refund = await refundBookingPayment({
    bookingId: b.id,
    bookingReference: b.reference,
    payment: view.payment,
    amountCents: refundCents,
    reason,
    approvedBy,
  });
  const refundOk = refund.ok;
  if (!refund.ok && refund.code === "stripe_error")
    await slack(
      "alerts",
      `:rotating_light: Refund of ${formatMoney(refundCents, b.currency)} for ${b.reference} failed: ${refund.message}. Finance to process manually.`,
    );
  const credit = await creditInvoiceForCancellation({
    invoice: view.invoice,
    bookingReference: b.reference,
    refundCents,
    retainedCents,
    stripeRefundId: refund.ok ? (refund.row?.stripe_refund_id ?? null) : null,
    reason,
  });
  if (credit.creditNoteId && refund.ok && refund.row)
    await adminDb().from("refunds").update({ stripe_credit_note_id: credit.creditNoteId }).eq("id", refund.row.id);

  // 4. Record the outcome on the booking for both screens.
  const { data: updated } = await adminDb()
    .from("booking_requests")
    .update({
      cancellation_reason: reason,
      cancel_refund_cents: refundCents,
      cancel_retained_cents: retainedCents,
      cancellation_requested_at: b.cancellation_requested_at,
    })
    .eq("id", b.id)
    .select("*")
    .single();
  if (updated) b = updated;

  // 5. Tell people.
  const label = moneyLabel(b, refundCents, retainedCents, view.payment, view.invoice, refundOk);
  await sendBookingCancelled(
    b,
    d.listing.name,
    { cancelledBy: livluxe ? "livluxe" : "partner", reason, moneyLabel: label },
    requestId,
  );
  await slack(
    "bookings",
    `:x: ${b.reference} ${q.kind === "withdraw" ? "withdrawn" : "cancelled"} by ${livluxe ? "Live Luxe" : (d.org?.name ?? "partner")} · ${d.listing.name} · ${b.check_in} → ${b.check_out} · refund ${formatMoney(refundCents, b.currency)}, retained ${formatMoney(retainedCents, b.currency)}` +
      (ha.status === "skipped"
        ? " · Hostaway cancel skipped (non-production)"
        : ha.status === "failed"
          ? ` · Hostaway cancel FAILED (${ha.reason})`
          : "") +
      (credit.voided ? " · invoice voided" : credit.creditNoteId ? " · credit note issued" : ""),
  );
  log.info("booking.cancelled", {
    requestId,
    reference: b.reference,
    kind: q.kind,
    refundCents,
    retainedCents,
    hostaway: ha.status,
    refundOk,
  });
  return {
    booking: b,
    refundCents,
    retainedCents,
    refundOk,
    hostaway: ha.status,
    note: label,
  };
}

/** Inside the cut-off: the partner asks, ops decide. Idempotent (a second ask just updates the note). */
export async function requestCancellation(
  claims: SessionClaims,
  id: string,
  input: { reason: CancellationReason; note: string },
  requestId: string,
): Promise<BookingRequestRow> {
  if (!can(claims.role, "requests.cancel")) throw new DomainError("FORBIDDEN");
  const d = await getRequest(id);
  if (!d) throw new DomainError("NOT_FOUND", { id });
  if (d.request.org_id !== claims.org_id && !isLivluxeRole(claims.role)) throw new DomainError("FORBIDDEN");
  const view = await cancellationView(d);
  if (!view.quote || view.quote.kind !== "cancel")
    throw new DomainError("INVALID_STATE_TRANSITION", { from: d.request.status, to: "CANCELLED" });
  const requestedBy = await partnerUserId(claims);
  const { data, error } = await adminDb()
    .from("booking_requests")
    .update({
      cancellation_requested_at: new Date().toISOString(),
      cancellation_requested_by: requestedBy,
      cancellation_reason: reasonText(input),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`cancellation request failed: ${error?.message}`);
  await slack(
    "bookings",
    `:warning: ${data.reference} cancellation requested by ${d.org?.name ?? "partner"} (${view.quote.daysUntilCheckIn} days before check-in, policy retains ${view.quote.retainPct}%). Decide at /admin/bookings/${id}.`,
  );
  log.info("booking.cancellation_requested", { requestId, reference: data.reference });
  return data;
}
