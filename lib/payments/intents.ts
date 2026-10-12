/**
 * PaymentIntents for a booking — spec §11.1 mode A, §11.3, §11.4.
 *
 * - One PaymentIntent per attempt; the newest row on `payments` is the live one.
 * - 'authorise' = manual capture while the request is being reviewed; captured on
 *   approval, voided on decline/expiry.
 * - 'charge' = immediate capture, only once a request is APPROVED/AWAITING_PAYMENT
 *   (the earlier hold lapsed or failed).
 * - Stripe is the source of truth: every row is written from a fresh retrieve of
 *   the PaymentIntent, never from the client.
 */
import "server-only";
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow, PaymentRow } from "@/lib/db/types";
import { DomainError } from "@/lib/domain/errors";
import { paymentKeys, paymentStateFromStripe, type PaymentState } from "@/lib/domain/payments";
import { log } from "@/lib/observability/logger";
import { getStripe, type BookingPaymentMetadata } from "@/lib/stripe/client";
import { ensureStripeCustomer, loadOrgBilling } from "./customers";

const OPEN_PI_STATUSES = new Set(["requires_payment_method", "requires_confirmation", "requires_action", "processing"]);

export async function loadBookingAdmin(id: string): Promise<BookingRequestRow> {
  const { data, error } = await adminDb().from("booking_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  if (!data) throw new DomainError("NOT_FOUND", { id });
  return data;
}

export async function latestPayment(bookingId: string): Promise<PaymentRow | null> {
  const { data, error } = await adminDb()
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`payments read failed: ${error.message}`);
  return data;
}

export const paymentState = (row: PaymentRow | null): PaymentState | null =>
  row ? paymentStateFromStripe(row.status, row.failure_code) : null;

function cardOf(pi: Stripe.PaymentIntent): { brand: string | null; last4: string | null; type: string | null } {
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const details = charge?.payment_method_details;
  return {
    type: details?.type ?? pi.payment_method_types[0] ?? null,
    brand: details?.card?.brand ?? null,
    last4: details?.card?.last4 ?? null,
  };
}

/**
 * Re-fetch the PaymentIntent and mirror it. Returns null when the intent does
 * not belong to a booking (e.g. created by hand in the Stripe dashboard).
 */
export async function syncPaymentIntent(
  source: string | Stripe.PaymentIntent,
): Promise<{ row: PaymentRow; previous: PaymentState | null } | null> {
  const pi =
    typeof source === "string"
      ? await getStripe().paymentIntents.retrieve(source, { expand: ["latest_charge"] })
      : source;
  const db = adminDb();
  const { data: existing } = await db.from("payments").select("*").eq("stripe_payment_intent_id", pi.id).maybeSingle();
  const bookingId = existing?.booking_id ?? pi.metadata?.booking_id;
  if (!bookingId) {
    log.info("stripe.pi.not_ours", { paymentIntentId: pi.id });
    return null;
  }
  const card = cardOf(pi);
  const now = new Date().toISOString();
  const state = paymentStateFromStripe(pi.status, pi.last_payment_error?.code ?? null);
  const patch = {
    booking_id: bookingId,
    stripe_payment_intent_id: pi.id,
    status: pi.status,
    mode: (pi.capture_method === "manual" ? "authorise" : "charge") as PaymentRow["mode"],
    amount_authorised_cents:
      pi.status === "requires_capture" || pi.status === "succeeded"
        ? pi.amount_capturable || pi.amount_received || pi.amount
        : (existing?.amount_authorised_cents ?? 0),
    amount_captured_cents: pi.amount_received,
    currency: pi.currency.toUpperCase(),
    method_type: card.type,
    card_brand: card.brand,
    card_last4: card.last4,
    authorised_at: existing?.authorised_at ?? (state === "authorised" || state === "captured" ? now : null),
    captured_at: existing?.captured_at ?? (state === "captured" ? now : null),
    canceled_at: existing?.canceled_at ?? (state === "canceled" ? now : null),
    failure_code: pi.last_payment_error?.code ?? pi.last_payment_error?.decline_code ?? null,
    failure_message: pi.last_payment_error?.message ?? null,
    updated_at: now,
  };
  const { data, error } = await db
    .from("payments")
    .upsert(patch, { onConflict: "stripe_payment_intent_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`payments upsert failed: ${error?.message}`);
  return { row: data, previous: paymentState(existing ?? null) };
}

export interface IntentView {
  clientSecret: string | null;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  mode: PaymentRow["mode"];
  state: PaymentState;
}

/**
 * Get-or-create the PaymentIntent the partner should confirm for this booking.
 * Reuses an open intent for the same amount and mode; otherwise cancels what is
 * cancellable and starts a fresh attempt. Idempotent on (booking, quote, attempt).
 */
export async function ensurePaymentIntent(booking: BookingRequestRow, payerEmail?: string | null): Promise<IntentView> {
  if (booking.total_cents == null || booking.total_cents <= 0)
    throw new DomainError("VALIDATION_FAILED", {
      detail: "This request is priced by Live Luxe; no card hold is needed yet.",
    });
  const wantMode: PaymentRow["mode"] = booking.status === "AWAITING_PAYMENT" ? "charge" : "authorise";
  const stripe = getStripe();

  const existing = await latestPayment(booking.id);
  if (existing) {
    const pi = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id, { expand: ["latest_charge"] });
    const synced = await syncPaymentIntent(pi);
    const state = paymentState(synced?.row ?? existing)!;
    const sameTerms = pi.amount === booking.total_cents && existing.mode === wantMode;
    if (state === "captured" || state === "authorised" || (sameTerms && OPEN_PI_STATUSES.has(pi.status))) {
      return {
        clientSecret: state === "captured" || state === "authorised" ? null : pi.client_secret,
        paymentIntentId: pi.id,
        amountCents: pi.amount,
        currency: pi.currency.toUpperCase(),
        mode: existing.mode,
        state,
      };
    }
    if (OPEN_PI_STATUSES.has(pi.status)) {
      // Amount or mode changed (counter-offer, approval): retire the stale intent.
      await stripe.paymentIntents
        .cancel(pi.id, { cancellation_reason: "abandoned" }, { idempotencyKey: paymentKeys.cancel(pi.id) })
        .then(syncPaymentIntent)
        .catch((e) => log.warn("stripe.pi.cancel_failed", { paymentIntentId: pi.id, error: String(e) }));
    }
  }

  const org = await loadOrgBilling(booking.org_id);
  const customerId = await ensureStripeCustomer(org, payerEmail);
  const { count } = await adminDb()
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id);
  const attempt = (count ?? 0) + 1;
  const metadata: BookingPaymentMetadata = {
    booking_reference: booking.reference,
    booking_id: booking.id,
    org_id: booking.org_id,
    listing_id: booking.listing_id,
    check_in: booking.check_in,
    check_out: booking.check_out,
    ...(booking.claim_ref ? { claim_ref: booking.claim_ref } : {}),
    ...(booking.po_number ? { po_number: booking.po_number } : {}),
  };
  const pi = await stripe.paymentIntents.create(
    {
      amount: booking.total_cents,
      currency: booking.currency.toLowerCase(),
      customer: customerId,
      capture_method: wantMode === "authorise" ? "manual" : "automatic",
      automatic_payment_methods: { enabled: true },
      metadata: { ...metadata },
      description: `Livluxe booking ${booking.reference}`,
      statement_descriptor_suffix: booking.reference.slice(0, 22),
    },
    { idempotencyKey: paymentKeys.intent(booking.id, booking.quote_id, attempt) },
  );
  const synced = await syncPaymentIntent(pi);
  log.info("stripe.pi.created", { reference: booking.reference, paymentIntentId: pi.id, mode: wantMode, attempt });
  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    amountCents: pi.amount,
    currency: pi.currency.toUpperCase(),
    mode: wantMode,
    state: paymentState(synced?.row ?? null) ?? "pending",
  };
}

/** Decline / cancel / expiry: release every uncaptured hold on the booking. Never throws. */
export async function voidBookingAuthorisations(bookingId: string, reason: string): Promise<number> {
  const { data: rows } = await adminDb()
    .from("payments")
    .select("stripe_payment_intent_id, status")
    .eq("booking_id", bookingId)
    .in("status", ["requires_capture", ...OPEN_PI_STATUSES]);
  let voided = 0;
  for (const r of rows ?? []) {
    try {
      const pi = await getStripe().paymentIntents.cancel(
        r.stripe_payment_intent_id,
        { cancellation_reason: "requested_by_customer" },
        { idempotencyKey: paymentKeys.cancel(r.stripe_payment_intent_id) },
      );
      await syncPaymentIntent(pi);
      voided++;
    } catch (e) {
      log.warn("stripe.pi.void_failed", {
        bookingId,
        paymentIntentId: r.stripe_payment_intent_id,
        reason,
        error: String(e),
      });
    }
  }
  if (voided) log.info("stripe.pi.voided", { bookingId, voided, reason });
  return voided;
}

export type CaptureResult =
  | { ok: true; row: PaymentRow }
  | { ok: false; code: "no_authorisation" | "card_error" | "stripe_error"; message: string };

/** Mode A capture on approval (§11.1). Idempotent on the PaymentIntent id. */
export async function captureBookingPayment(bookingId: string): Promise<CaptureResult> {
  const latest = await latestPayment(bookingId);
  if (!latest) return { ok: false, code: "no_authorisation", message: "No card hold on file." };
  if (latest.status === "succeeded") return { ok: true, row: latest };
  if (latest.status !== "requires_capture")
    return { ok: false, code: "no_authorisation", message: `Card hold is ${latest.status}, not capturable.` };
  try {
    const pi = await getStripe().paymentIntents.capture(
      latest.stripe_payment_intent_id,
      { expand: ["latest_charge"] },
      { idempotencyKey: paymentKeys.capture(latest.stripe_payment_intent_id) },
    );
    const synced = await syncPaymentIntent(pi);
    if (!synced || pi.status !== "succeeded")
      return { ok: false, code: "stripe_error", message: `Capture returned ${pi.status}.` };
    return { ok: true, row: synced.row };
  } catch (e) {
    const err = e as { type?: string; code?: string; message?: string };
    await syncPaymentIntent(latest.stripe_payment_intent_id).catch(() => null);
    log.warn("stripe.pi.capture_failed", {
      bookingId,
      paymentIntentId: latest.stripe_payment_intent_id,
      error: err.message,
    });
    return {
      ok: false,
      code: err.type === "StripeCardError" ? "card_error" : "stripe_error",
      message: err.message ?? "Capture failed.",
    };
  }
}
