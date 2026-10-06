/**
 * Stripe webhook event catalogue and handlers — spec §11.3, Appendix C.
 *
 * The Route Handler (app/api/webhooks/stripe/route.ts) verifies the signature on
 * the RAW body, persists the event to webhook_events (unique on event.id), returns
 * 200 fast. The drain-webhooks cron calls processStripeEvent() for each queued row.
 *
 * Out-of-order delivery is normal: handlers compare against current object state
 * and re-fetch from Stripe when in doubt.
 */
import type Stripe from "stripe";
import { log } from "@/lib/observability/logger";

export type StripeEventHandler = (event: Stripe.Event) => Promise<void>;

const notImplemented =
  (name: string): StripeEventHandler =>
  async (event) => {
    log.info("stripe.event.todo", { handler: name, eventId: event.id, type: event.type });
  };

/** Map every consumed event type to its handler. Unknown types are logged and skipped. */
export const STRIPE_HANDLERS: Record<string, StripeEventHandler> = {
  // Authorisation succeeded → mark payment authorised, record authorised_at, move request to ops queue.
  "payment_intent.amount_capturable_updated": notImplemented("onAuthorised"),
  // Capture complete → record captured_at; if Hostaway write succeeded, transition to CONFIRMED.
  "payment_intent.succeeded": notImplemented("onCaptured"),
  // Record failure code; notify partner; keep hold alive for grace period.
  "payment_intent.payment_failed": notImplemented("onPaymentFailed"),
  // Authorisation voided/expired → release hold, notify, log.
  "payment_intent.canceled": notImplemented("onPaymentCanceled"),
  // 3DS challenge outstanding — surface, do not treat as failure.
  "payment_intent.requires_action": notImplemented("onRequiresAction"),
  "charge.refunded": notImplemented("onRefunded"),
  // Alert finance; freeze automated refunds; assemble evidence pack.
  "charge.dispute.created": notImplemented("onDisputeCreated"),
  "charge.dispute.closed": notImplemented("onDisputeClosed"),
  "invoice.finalized": notImplemented("onInvoiceFinalized"),
  "invoice.sent": notImplemented("onInvoiceSent"),
  "invoice.paid": notImplemented("onInvoicePaid"),
  "invoice.payment_failed": notImplemented("onInvoicePaymentFailed"),
  "payment_method.attached": notImplemented("onPaymentMethodAttached"),
  "payment_method.detached": notImplemented("onPaymentMethodDetached"),
};

export async function processStripeEvent(event: Stripe.Event): Promise<"processed" | "skipped"> {
  const handler = STRIPE_HANDLERS[event.type];
  if (!handler) {
    log.info("stripe.event.unhandled", { eventId: event.id, type: event.type });
    return "skipped";
  }
  await handler(event);
  return "processed";
}
