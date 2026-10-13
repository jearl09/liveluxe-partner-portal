/**
 * Stripe webhook event catalogue and handlers — spec §11.3, Appendix C.
 *
 * The Route Handler (app/api/webhooks/stripe/route.ts) verifies the signature on
 * the RAW body, persists the event to webhook_events (unique on event.id), returns
 * 200 fast and processes it right after the response. The drain-webhooks job
 * retries anything left in 'received' or 'failed'.
 *
 * Out-of-order delivery is normal: every handler re-fetches the object from
 * Stripe (syncPaymentIntent / syncInvoice) and compares with the current booking
 * state instead of trusting the payload.
 */
import type Stripe from "stripe";
import { confirmBooking } from "@/lib/payments/confirm";
import { loadBookingAdmin, syncPaymentIntent } from "@/lib/payments/intents";
import { syncInvoice } from "@/lib/payments/invoices";
import { syncRefund } from "@/lib/payments/refunds";
import { alertCritical, slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { getStripe } from "@/lib/stripe/client";

export type StripeEventHandler = (event: Stripe.Event, requestId: string) => Promise<void>;

const piOf = (event: Stripe.Event) => event.data.object as Stripe.PaymentIntent;
const invoiceOf = (event: Stripe.Event) => event.data.object as Stripe.Invoice;

const onAuthorised: StripeEventHandler = async (event) => {
  const synced = await syncPaymentIntent(piOf(event).id);
  if (!synced) return;
  const b = await loadBookingAdmin(synced.row.booking_id);
  if (synced.previous !== "authorised") {
    await slack(
      "bookings",
      `:credit_card: ${b.reference} card held (${synced.row.card_brand ?? "card"} ending ${synced.row.card_last4 ?? "????"}). Ready to approve.`,
    );
  }
};

const onCaptured: StripeEventHandler = async (event, requestId) => {
  const synced = await syncPaymentIntent(piOf(event).id);
  if (!synced) return;
  const b = await loadBookingAdmin(synced.row.booking_id);
  if (b.status === "APPROVED" || b.status === "AWAITING_PAYMENT") {
    const out = await confirmBooking(b.id, requestId, "webhook");
    log.info("stripe.webhook.confirm", { reference: b.reference, ...out });
  }
};

const onPaymentFailed: StripeEventHandler = async (event) => {
  const synced = await syncPaymentIntent(piOf(event).id);
  if (!synced) return;
  const b = await loadBookingAdmin(synced.row.booking_id);
  log.info("stripe.payment_failed", { reference: b.reference, code: synced.row.failure_code });
  // The partner sees the decline inline in the Payment Element and can retry; the hold stays alive.
};

const onCanceled: StripeEventHandler = async (event) => {
  const synced = await syncPaymentIntent(piOf(event).id);
  if (synced)
    log.info("stripe.pi.canceled", {
      bookingId: synced.row.booking_id,
      paymentIntentId: synced.row.stripe_payment_intent_id,
    });
};

const onRequiresAction: StripeEventHandler = async (event) => {
  await syncPaymentIntent(piOf(event).id);
};

const onInvoiceChanged: StripeEventHandler = async (event) => {
  await syncInvoice(invoiceOf(event).id);
};

const onInvoicePaid: StripeEventHandler = async (event, requestId) => {
  const row = await syncInvoice(invoiceOf(event).id);
  if (!row?.booking_id) return;
  const b = await loadBookingAdmin(row.booking_id);
  if (b.status === "APPROVED" || b.status === "AWAITING_PAYMENT") {
    const out = await confirmBooking(b.id, requestId, "webhook");
    log.info("stripe.webhook.confirm", { reference: b.reference, ...out });
  }
  await slack("bookings", `:moneybag: Invoice ${row.number ?? row.stripe_invoice_id} paid for ${b.reference}.`);
};

const onInvoicePaymentFailed: StripeEventHandler = async (event) => {
  const row = await syncInvoice(invoiceOf(event).id);
  if (row)
    await slack(
      "alerts",
      `:warning: Invoice ${row.number ?? row.stripe_invoice_id} payment failed (org ${row.org_id}).`,
    );
};

const onDispute: StripeEventHandler = async (event) => {
  const d = event.data.object as Stripe.Dispute;
  await alertCritical("Stripe dispute opened", {
    disputeId: d.id,
    amount: d.amount,
    reason: d.reason,
    charge: d.charge,
  });
};

const onRefunded: StripeEventHandler = async (event) => {
  const charge = event.data.object as Stripe.Charge;
  const refunds = await getStripe().refunds.list({ charge: charge.id, limit: 20 });
  for (const r of refunds.data) await syncRefund(r);
};

const onRefundUpdated: StripeEventHandler = async (event) => {
  const r = event.data.object as Stripe.Refund;
  const row = await syncRefund(r);
  if (row && r.status === "failed")
    await alertCritical("Stripe refund failed", {
      refundId: r.id,
      bookingId: row.booking_id,
      reason: r.failure_reason,
    });
};

const logOnly =
  (name: string): StripeEventHandler =>
  async (event) => {
    log.info("stripe.event.logged", { handler: name, eventId: event.id, type: event.type });
  };

/** Map every consumed event type to its handler. Unknown types are logged and skipped. */
export const STRIPE_HANDLERS: Record<string, StripeEventHandler> = {
  "payment_intent.amount_capturable_updated": onAuthorised,
  "payment_intent.succeeded": onCaptured,
  "payment_intent.payment_failed": onPaymentFailed,
  "payment_intent.canceled": onCanceled,
  "payment_intent.requires_action": onRequiresAction,
  "charge.refunded": onRefunded,
  "refund.updated": onRefundUpdated,
  "charge.dispute.created": onDispute,
  "charge.dispute.closed": logOnly("onDisputeClosed"),
  "invoice.finalized": onInvoiceChanged,
  "invoice.sent": onInvoiceChanged,
  "invoice.paid": onInvoicePaid,
  "invoice.payment_failed": onInvoicePaymentFailed,
  "invoice.voided": onInvoiceChanged,
  "invoice.marked_uncollectible": onInvoiceChanged,
  "payment_method.attached": logOnly("onPaymentMethodAttached"),
  "payment_method.detached": logOnly("onPaymentMethodDetached"),
};

export async function processStripeEvent(event: Stripe.Event, requestId: string): Promise<"processed" | "skipped"> {
  const handler = STRIPE_HANDLERS[event.type];
  if (!handler) {
    log.info("stripe.event.unhandled", { eventId: event.id, type: event.type });
    return "skipped";
  }
  await handler(event, requestId);
  return "processed";
}
