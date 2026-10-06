/**
 * Stripe client and the helpers the three payment modes need — spec §11.
 *   A. Authorise then capture (default): PaymentIntent capture_method='manual'
 *   B. Deposit now, balance on invoice
 *   C. Invoice only (net terms), gated by credit limit
 *
 * Stripe is the source of truth for payment state. Booking rows are updated from
 * webhooks (lib/stripe/webhooks.ts), never from client-side success callbacks.
 */
import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

let stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(env().STRIPE_SECRET_KEY, {
      typescript: true,
      appInfo: { name: "Livluxe Partner Portal", url: env().NEXT_PUBLIC_APP_URL },
    });
  }
  return stripe;
}

export interface BookingPaymentMetadata {
  booking_reference: string;
  booking_id: string;
  org_id: string;
  listing_id: string;
  check_in: string;
  check_out: string;
  claim_ref?: string;
  po_number?: string;
}

/** Mode A: authorise without capturing. Amount always comes from the server-side frozen quote. */
export async function createAuthorisation(args: {
  customerId: string;
  amountCents: number;
  currency: string;
  metadata: BookingPaymentMetadata;
  idempotencyKey: string;
}) {
  return getStripe().paymentIntents.create(
    {
      amount: args.amountCents,
      currency: args.currency.toLowerCase(),
      customer: args.customerId,
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      metadata: { ...args.metadata },
      description: `Livluxe booking ${args.metadata.booking_reference}`,
    },
    { idempotencyKey: args.idempotencyKey },
  );
}

export async function capturePayment(paymentIntentId: string, idempotencyKey: string, amountCents?: number) {
  return getStripe().paymentIntents.capture(paymentIntentId, amountCents ? { amount_to_capture: amountCents } : {}, {
    idempotencyKey,
  });
}

export async function voidAuthorisation(paymentIntentId: string, idempotencyKey: string) {
  return getStripe().paymentIntents.cancel(paymentIntentId, {}, { idempotencyKey });
}

/** One Stripe Customer per partner organisation, not per user (§11.2). */
export async function ensureCustomer(org: { id: string; name: string; abn?: string | null; billingEmail: string }) {
  return getStripe().customers.create({
    name: org.name,
    email: org.billingEmail,
    metadata: { livluxe_org_id: org.id },
    ...(org.abn ? { tax_id_data: [{ type: "au_abn", value: org.abn }] } : {}),
  });
}
