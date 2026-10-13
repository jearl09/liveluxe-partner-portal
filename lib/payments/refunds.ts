/**
 * Refunds and credit notes — spec §11.6 (Refund / CreditNote), Appendix B
 * CONFIRMED→CANCELLED side effects.
 *
 * - A refund is always drawn from the booking's captured PaymentIntent, never
 *   created loose; the amount is decided by the caller (policy or ops override).
 * - Stripe is the source of truth: the `refunds` row is written from the Refund
 *   object and kept current by the charge.refunded webhook.
 * - When the booking has an invoice, a credit note is issued so the tax record
 *   stays coherent: `refund_amount` for a refunded card payment, `credit_amount`
 *   for an open (unpaid) net-terms invoice, `out_of_band_amount` otherwise.
 * - Idempotent on (booking, amount): a retry after a crash returns the existing row.
 */
import "server-only";
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import type { InvoiceRow, PaymentRow, RefundRow } from "@/lib/db/types";
import { log } from "@/lib/observability/logger";
import { getStripe } from "@/lib/stripe/client";
import { syncInvoice } from "./invoices";

export const refundKeys = {
  refund: (bookingId: string, amountCents: number) => `refund:${bookingId}:${amountCents}`,
  creditNote: (invoiceId: string, amountCents: number) => `credit_note:${invoiceId}:${amountCents}`,
  voidInvoice: (invoiceId: string) => `void_invoice:${invoiceId}`,
};

export async function refundsForBooking(bookingId: string): Promise<RefundRow[]> {
  const { data, error } = await adminDb()
    .from("refunds")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`refunds read failed: ${error.message}`);
  return data ?? [];
}

/** Mirror one Stripe Refund. Returns null when it is not linked to a booking we know. */
export async function syncRefund(
  source: string | Stripe.Refund,
  extra: { bookingId?: string; paymentId?: string | null; approvedBy?: string | null; reason?: string | null } = {},
): Promise<RefundRow | null> {
  const refund = typeof source === "string" ? await getStripe().refunds.retrieve(source) : source;
  const db = adminDb();
  const { data: existing } = await db.from("refunds").select("*").eq("stripe_refund_id", refund.id).maybeSingle();
  const bookingId = existing?.booking_id ?? extra.bookingId ?? refund.metadata?.booking_id;
  if (!bookingId) {
    log.info("stripe.refund.not_ours", { refundId: refund.id });
    return null;
  }
  const patch = {
    booking_id: bookingId,
    payment_id: existing?.payment_id ?? extra.paymentId ?? null,
    stripe_refund_id: refund.id,
    amount_cents: refund.amount,
    reason: existing?.reason ?? extra.reason ?? refund.metadata?.reason ?? null,
    status: refund.status ?? "pending",
    failure_reason: refund.failure_reason ?? null,
    approved_by: existing?.approved_by ?? extra.approvedBy ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from("refunds")
    .upsert(patch, { onConflict: "stripe_refund_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`refunds upsert failed: ${error?.message}`);
  return data;
}

export type RefundResult =
  | { ok: true; row: RefundRow | null; amountCents: number }
  | { ok: false; code: "nothing_captured" | "stripe_error"; message: string };

/**
 * Refund `amountCents` of the booking's captured payment. Zero is a valid
 * answer (full retention) and returns ok without touching Stripe.
 */
export async function refundBookingPayment(input: {
  bookingId: string;
  bookingReference: string;
  payment: PaymentRow | null;
  amountCents: number;
  reason: string;
  approvedBy: string | null;
}): Promise<RefundResult> {
  const { payment } = input;
  if (input.amountCents <= 0) return { ok: true, row: null, amountCents: 0 };
  if (!payment || payment.status !== "succeeded" || payment.amount_captured_cents <= 0)
    return { ok: false, code: "nothing_captured", message: "No captured card payment to refund." };
  const amount = Math.min(input.amountCents, payment.amount_captured_cents);
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: payment.stripe_payment_intent_id,
        amount,
        reason: "requested_by_customer",
        metadata: { booking_id: input.bookingId, booking_reference: input.bookingReference, reason: input.reason },
      },
      { idempotencyKey: refundKeys.refund(input.bookingId, amount) },
    );
    const row = await syncRefund(refund, {
      bookingId: input.bookingId,
      paymentId: payment.id,
      approvedBy: input.approvedBy,
      reason: input.reason,
    });
    log.info("stripe.refund.created", { reference: input.bookingReference, refundId: refund.id, amount });
    return { ok: true, row, amountCents: amount };
  } catch (e) {
    const err = e as { message?: string };
    log.error("stripe.refund.failed", { reference: input.bookingReference, error: err.message ?? String(e) });
    return { ok: false, code: "stripe_error", message: err.message ?? "Refund failed." };
  }
}

/**
 * Keep the tax record coherent after a cancellation (§11.6):
 *   open invoice (net terms, unpaid)  → void it entirely when nothing is retained, else credit the refund share;
 *   paid invoice                      → credit note for the refunded amount, linked to the Stripe refund when there is one.
 * Never throws: a missing credit note is a finance follow-up, not a failed cancellation.
 */
export async function creditInvoiceForCancellation(input: {
  invoice: InvoiceRow | null;
  bookingReference: string;
  refundCents: number;
  retainedCents: number;
  stripeRefundId: string | null;
  reason: string;
}): Promise<{ creditNoteId: string | null; voided: boolean }> {
  const inv = input.invoice;
  if (!inv) return { creditNoteId: null, voided: false };
  const stripe = getStripe();
  try {
    if (inv.status === "open" || inv.status === "uncollectible") {
      if (input.retainedCents <= 0) {
        await stripe.invoices.voidInvoice(
          inv.stripe_invoice_id,
          {},
          { idempotencyKey: refundKeys.voidInvoice(inv.stripe_invoice_id) },
        );
        await syncInvoice(inv.stripe_invoice_id);
        return { creditNoteId: null, voided: true };
      }
      const credit = Math.max(0, inv.amount_due_cents - input.retainedCents);
      if (credit <= 0) return { creditNoteId: null, voided: false };
      const note = await stripe.creditNotes.create(
        {
          invoice: inv.stripe_invoice_id,
          credit_amount: credit,
          reason: "order_change",
          memo: `Cancellation of booking ${input.bookingReference}: ${input.reason}`,
          lines: [{ type: "custom_line_item", description: "Cancellation credit", quantity: 1, unit_amount: credit }],
        },
        { idempotencyKey: refundKeys.creditNote(inv.stripe_invoice_id, credit) },
      );
      await syncInvoice(inv.stripe_invoice_id);
      return { creditNoteId: note.id, voided: false };
    }
    if (inv.status === "paid" && input.refundCents > 0) {
      const amount = Math.min(input.refundCents, inv.amount_paid_cents);
      const note = await stripe.creditNotes.create(
        {
          invoice: inv.stripe_invoice_id,
          ...(input.stripeRefundId ? { refunds: [{ refund: input.stripeRefundId }] } : { out_of_band_amount: amount }),
          reason: "order_change",
          memo: `Cancellation of booking ${input.bookingReference}: ${input.reason}`,
          lines: [{ type: "custom_line_item", description: "Cancellation refund", quantity: 1, unit_amount: amount }],
        },
        { idempotencyKey: refundKeys.creditNote(inv.stripe_invoice_id, amount) },
      );
      await syncInvoice(inv.stripe_invoice_id);
      return { creditNoteId: note.id, voided: false };
    }
  } catch (e) {
    log.error("stripe.credit_note.failed", {
      reference: input.bookingReference,
      invoiceId: inv.stripe_invoice_id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return { creditNoteId: null, voided: false };
}
