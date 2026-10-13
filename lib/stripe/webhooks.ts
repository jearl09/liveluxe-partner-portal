/**
 * Stripe webhook event catalogue and handlers — spec §11.3, Appendix C, §17.2.
 *
 * The Route Handler (app/api/webhooks/stripe/route.ts) verifies the signature on
 * the RAW body, persists the event to webhook_events (unique on event.id), returns
 * 200 fast and processes it right after the response. The drain-webhooks job
 * retries anything left in 'received' or 'failed'.
 *
 * Out-of-order and duplicate delivery are normal: every handler re-fetches the
 * object from Stripe (syncPaymentIntent / syncInvoice / syncRefund) and acts on
 * the booking's *current* state, never on the payload or on the event's age.
 * An event for a booking whose local row is not there yet throws OrphanEvent, which
 * parks the event for retry with backoff (§17.2 "webhook arrives before the local
 * record is committed").
 */
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import { DomainError } from "@/lib/domain/errors";
import { declineReasonText } from "@/lib/domain/payments";
import { confirmBooking } from "@/lib/payments/confirm";
import { recordDispute } from "@/lib/payments/disputes";
import { applyCreditStanding, loadDunningPolicy } from "@/lib/payments/dunning";
import { loadBookingAdmin, syncPaymentIntent } from "@/lib/payments/intents";
import { syncInvoice } from "@/lib/payments/invoices";
import { sendCardDeclined, sendHoldReleased } from "@/lib/payments/notify";
import { syncRefund } from "@/lib/payments/refunds";
import { alertCritical, slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { getStripe } from "@/lib/stripe/client";

export type StripeEventHandler = (event: Stripe.Event, requestId: string) => Promise<void>;

/** Thrown when the event references a booking we do not have (yet). The drain parks and retries it. */
export class OrphanEvent extends Error {
  constructor(public readonly what: string) {
    super(`orphan event: ${what}`);
    this.name = "OrphanEvent";
  }
}

const piOf = (event: Stripe.Event) => event.data.object as Stripe.PaymentIntent;
const invoiceOf = (event: Stripe.Event) => event.data.object as Stripe.Invoice;

/** Re-fetch + mirror the intent; park the event when its booking is not committed locally yet. */
async function syncOrPark(event: Stripe.Event) {
  const pi = piOf(event);
  try {
    const synced = await syncPaymentIntent(pi.id);
    if (synced) return synced;
  } catch (e) {
    // A foreign-key failure on payments.booking_id means the booking row is not there yet.
    if (pi.metadata?.booking_id) throw new OrphanEvent(`booking ${pi.metadata.booking_id} (${String(e).slice(0, 80)})`);
    throw e;
  }
  if (pi.metadata?.booking_id) throw new OrphanEvent(`booking ${pi.metadata.booking_id}`);
  return null; // not ours (dashboard-created object) — skip
}

async function loadBookingOrPark(bookingId: string) {
  try {
    return await loadBookingAdmin(bookingId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") throw new OrphanEvent(`booking ${bookingId}`);
    throw e;
  }
}

async function propertyName(listingId: string): Promise<string> {
  const { data } = await adminDb().from("listings").select("public_name").eq("id", listingId).maybeSingle();
  return data?.public_name ?? "the property";
}

/** amount_capturable_updated: the hold landed. Ops may approve; an approved booking proceeds to confirmation. */
const onAuthorised: StripeEventHandler = async (event, requestId) => {
  const synced = await syncOrPark(event);
  if (!synced) return;
  const b = await loadBookingOrPark(synced.row.booking_id);
  if (synced.previous !== "authorised") {
    await slack(
      "bookings",
      `:credit_card: ${b.reference} card held (${synced.row.card_brand ?? "card"} ending ${synced.row.card_last4 ?? "????"}). ${
        b.status === "APPROVED" || b.status === "AWAITING_PAYMENT" ? "Confirming." : "Ready to approve."
      }`,
    );
  }
  if (b.status === "APPROVED" || b.status === "AWAITING_PAYMENT") {
    const out = await confirmBooking(b.id, requestId, "webhook");
    log.info("stripe.webhook.confirm", { reference: b.reference, ...out });
  }
};

/** succeeded: capture complete. If the Hostaway write has also succeeded, confirmation completes (§11.3). */
const onCaptured: StripeEventHandler = async (event, requestId) => {
  const synced = await syncOrPark(event);
  if (!synced) return;
  const b = await loadBookingOrPark(synced.row.booking_id);
  if (b.status === "APPROVED" || b.status === "AWAITING_PAYMENT") {
    const out = await confirmBooking(b.id, requestId, "webhook");
    log.info("stripe.webhook.confirm", { reference: b.reference, ...out });
  }
};

/** payment_failed: record the code, tell the partner in plain language, keep the hold alive (§17.2). */
const onPaymentFailed: StripeEventHandler = async (event, requestId) => {
  const synced = await syncOrPark(event);
  if (!synced) return;
  const b = await loadBookingOrPark(synced.row.booking_id);
  const code = synced.row.failure_code;
  log.info("stripe.payment_failed", { reference: b.reference, code });
  if (["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED", "APPROVED", "AWAITING_PAYMENT"].includes(b.status)) {
    await sendCardDeclined(
      b,
      await propertyName(b.listing_id),
      { paymentIntentId: synced.row.stripe_payment_intent_id, failureCode: code, reasonText: declineReasonText(code) },
      requestId,
    );
  }
};

/**
 * canceled: either our own void (decline / expiry / withdrawal / retired intent) or the
 * card network releasing an authorisation (§17.2 "Authorisation expires before approval").
 * Only the latter needs action: an approved booking moves to AWAITING_PAYMENT and the
 * partner is asked to re-authorise; a pending one is told the hold is gone.
 */
const onCanceled: StripeEventHandler = async (event, requestId) => {
  const synced = await syncOrPark(event);
  if (!synced) return;
  const pi = synced.pi;
  const ours = pi.cancellation_reason === "requested_by_customer" || pi.cancellation_reason === "abandoned";
  const wasAuthorised = synced.previous === "authorised" || !!synced.row.authorised_at;
  log.info("stripe.pi.canceled", {
    bookingId: synced.row.booking_id,
    paymentIntentId: pi.id,
    reason: pi.cancellation_reason,
    wasAuthorised,
  });
  if (ours || !wasAuthorised || synced.row.lapsed_notified_at) return;

  let b = await loadBookingOrPark(synced.row.booking_id);
  if (!["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED", "APPROVED"].includes(b.status)) return;
  if (b.status === "APPROVED") {
    const { data, error } = await adminDb().rpc("apply_booking_transition", {
      p_booking_id: b.id,
      p_expected_from: "APPROVED",
      p_to: "AWAITING_PAYMENT",
      p_reason: "card authorisation lapsed before capture",
      p_metadata: { paymentIntentId: pi.id, cancellationReason: pi.cancellation_reason } as never,
    });
    if (error) throw new Error(`transition APPROVED→AWAITING_PAYMENT failed: ${error.message}`);
    b = data as typeof b;
  }
  await adminDb()
    .from("payments")
    .update({ lapsed_notified_at: new Date().toISOString() })
    .eq("id", synced.row.id)
    .is("lapsed_notified_at", null);
  await sendHoldReleased(b, await propertyName(b.listing_id), pi.id, requestId);
  await slack(
    "bookings",
    `:hourglass: ${b.reference}: the card hold lapsed (network release). Partner asked to re-authorise${b.status === "AWAITING_PAYMENT" ? "; booking now awaiting payment" : ""}.`,
  );
};

const onRequiresAction: StripeEventHandler = async (event) => {
  await syncOrPark(event);
};

const onInvoiceChanged: StripeEventHandler = async (event) => {
  await syncInvoice(invoiceOf(event).id);
};

/** invoice.paid: mark paid; a mode-B balance clears the pre-arrival flag; credit standing recovers. */
const onInvoicePaid: StripeEventHandler = async (event, requestId) => {
  const row = await syncInvoice(invoiceOf(event).id);
  if (!row) return;
  if (row.booking_id) {
    const b = await loadBookingOrPark(row.booking_id);
    if (row.kind === "balance")
      await adminDb()
        .from("booking_requests")
        .update({ balance_paid_at: row.paid_at ?? new Date().toISOString() })
        .eq("id", b.id);
    if (b.status === "APPROVED" || b.status === "AWAITING_PAYMENT") {
      const out = await confirmBooking(b.id, requestId, "webhook");
      log.info("stripe.webhook.confirm", { reference: b.reference, ...out });
    }
    await slack("bookings", `:moneybag: Invoice ${row.number ?? row.stripe_invoice_id} paid for ${b.reference}.`);
  }
  await applyCreditStanding(row.org_id, await loadDunningPolicy(), new Date(), requestId);
};

/** invoice.payment_failed: start dunning; escalate to finance after N attempts; flag the org's standing (§11.3). */
const onInvoicePaymentFailed: StripeEventHandler = async (event, requestId) => {
  const row = await syncInvoice(invoiceOf(event).id);
  if (!row) return;
  const attempts = row.attempt_count + 1;
  await adminDb().from("invoices").update({ attempt_count: attempts }).eq("id", row.id);
  const { data: setting } = await adminDb()
    .from("settings")
    .select("value")
    .eq("key", "dunning.failed_attempts_to_finance")
    .maybeSingle();
  const threshold = Number(setting?.value ?? 2) || 2;
  const { data: org } = await adminDb()
    .from("partner_orgs")
    .select("name, credit_standing")
    .eq("id", row.org_id)
    .maybeSingle();
  if (org?.credit_standing === "good")
    await adminDb()
      .from("partner_orgs")
      .update({
        credit_standing: "watch",
        credit_standing_changed_at: new Date().toISOString(),
        credit_standing_reason: `invoice ${row.number ?? row.stripe_invoice_id} payment failed`,
      })
      .eq("id", row.org_id)
      .eq("credit_standing", "good");
  await slack(
    attempts >= threshold ? "alerts" : "bookings",
    `${attempts >= threshold ? ":rotating_light: Finance:" : ":warning:"} invoice ${row.number ?? row.stripe_invoice_id} payment failed (attempt ${attempts}) for ${org?.name ?? row.org_id}.`,
  );
  log.warn("stripe.invoice.payment_failed", { requestId, invoice: row.number, attempts, orgId: row.org_id });
};

const onDispute: StripeEventHandler = async (event, requestId) => {
  await recordDispute(event.data.object as Stripe.Dispute, requestId);
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
  "charge.dispute.updated": onDispute,
  "charge.dispute.closed": onDispute,
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
