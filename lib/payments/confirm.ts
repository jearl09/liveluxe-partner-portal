/**
 * APPROVED → CONFIRMED — spec §10.1 side effects, §11.1, §6.7.
 *
 * Runs as the system actor from three places: right after ops approve, from
 * the Stripe webhook when a payment succeeds, and from the drain job on retry.
 * Every step is idempotent, so running it twice (or after a crash halfway) is
 * safe: capture is keyed on the PaymentIntent, the Hostaway write on the
 * booking, the invoice on the booking, and the transition checks status first.
 *
 *   mode A (card)     capture the hold → Hostaway reservation → CONFIRMED → paid invoice (receipt) → email
 *   mode C (invoice)  net-terms invoice → Hostaway reservation → CONFIRMED → email
 *   capture failed    → AWAITING_PAYMENT, partner is asked to pay again (hold kept)
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow, InvoiceRow, PaymentRow } from "@/lib/db/types";
import { assertTransition, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { invoiceDaysFor, paymentModeFor } from "@/lib/domain/payments";
import type { QuoteLine } from "@/lib/domain/quote-engine";
import { ensureHostawayReservation } from "@/lib/hostaway/reservations";
import { alertCritical, slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { loadOrgBilling } from "./customers";
import { captureBookingPayment, latestPayment, loadBookingAdmin } from "./intents";
import { invoiceForBooking, issueInvoice } from "./invoices";
import { sendBookingConfirmed, sendPaymentRequired } from "./notify";

export type ConfirmTrigger = "approval" | "webhook" | "job";
export interface ConfirmOutcome {
  status: BookingStatus;
  note: string;
}

async function systemTransition(
  b: BookingRequestRow,
  to: BookingStatus,
  extra: { reason: string; metadata?: Record<string, unknown> },
): Promise<BookingRequestRow> {
  assertTransition(b.status, to, "system");
  const { data, error } = await adminDb().rpc("apply_booking_transition", {
    p_booking_id: b.id,
    p_expected_from: b.status,
    p_to: to,
    p_reason: extra.reason,
    p_metadata: (extra.metadata ?? null) as never,
  });
  if (error) throw new Error(`transition ${b.status}→${to} failed: ${error.message}`);
  log.info("booking.transition", { reference: b.reference, from: b.status, to, actor: "system" });
  return data as BookingRequestRow;
}

async function loadContext(b: BookingRequestRow) {
  const db = adminDb();
  const [listing, quote, setting] = await Promise.all([
    db.from("listings").select("public_name, hostaway_listing_id").eq("id", b.listing_id).single(),
    b.quote_id
      ? db.from("quotes").select("line_items, tax_cents, total_cents").eq("id", b.quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("settings").select("value").eq("key", "checkin.release_offset_hours").maybeSingle(),
  ]);
  if (!listing.data) throw new Error("listing missing for booking");
  return {
    listing: { name: listing.data.public_name, hostawayListingId: listing.data.hostaway_listing_id },
    quote: quote.data
      ? {
          lines: (Array.isArray(quote.data.line_items) ? quote.data.line_items : []) as unknown as QuoteLine[],
          taxCents: quote.data.tax_cents,
          totalCents: quote.data.total_cents,
        }
      : null,
    checkinOffsetHours: Number(setting.data?.value ?? 48) || 48,
  };
}

export async function confirmBooking(
  bookingId: string,
  requestId: string,
  trigger: ConfirmTrigger,
): Promise<ConfirmOutcome> {
  let b = await loadBookingAdmin(bookingId);
  if (b.status !== "APPROVED" && b.status !== "AWAITING_PAYMENT") return { status: b.status, note: "nothing to do" };

  const org = await loadOrgBilling(b.org_id);
  const mode = paymentModeFor(org.payment_terms);
  const ctx = await loadContext(b);
  const src = { booking: b, org, propertyName: ctx.listing.name, quote: ctx.quote };

  let payment: PaymentRow | null = null;
  let invoice: InvoiceRow | null = await invoiceForBooking(b.id);

  if (mode === "invoice") {
    invoice ??= await issueInvoice(src, {
      collection: "send_invoice",
      daysUntilDue: invoiceDaysFor(org.payment_terms),
    });
  } else {
    payment = await latestPayment(b.id);
    if (payment?.status !== "succeeded") {
      if (b.status !== "APPROVED") return { status: b.status, note: "awaiting partner payment" };
      const cap = await captureBookingPayment(b.id);
      if (!cap.ok) {
        const reason =
          cap.code === "no_authorisation"
            ? "The card hold placed at request time has lapsed or was never completed."
            : `The card could not be charged (${cap.message}).`;
        b = await systemTransition(b, "AWAITING_PAYMENT", {
          reason: `capture failed: ${cap.message}`,
          metadata: { captureError: cap.code },
        });
        await sendPaymentRequired(b, ctx.listing.name, reason, requestId);
        await slack(
          "bookings",
          `:warning: ${b.reference} approved but card capture failed (${cap.code}). Partner asked to pay.`,
        );
        return { status: "AWAITING_PAYMENT", note: cap.message };
      }
      payment = cap.row;
    }
  }

  // Money is secured. Now the inventory write.
  const ha = await ensureHostawayReservation(b, ctx.listing, requestId);
  if (ha.status === "failed") {
    await alertCritical("Confirmed payment but Hostaway reservation failed", {
      reference: b.reference,
      reason: ha.reason,
      requestId,
    });
    return { status: b.status, note: `hostaway: ${ha.reason}` };
  }

  b = await loadBookingAdmin(b.id);
  if (b.status !== "CONFIRMED") {
    b = await systemTransition(b, "CONFIRMED", {
      reason: `confirmed via ${trigger}`,
      metadata: {
        hostaway: ha.status,
        ...(ha.status === "created" || ha.status === "existing" ? { reservationId: ha.reservationId } : {}),
        paymentIntentId: payment?.stripe_payment_intent_id ?? null,
        invoiceNumber: invoice?.number ?? null,
      },
    });
  }

  if (mode === "card_authorise" && !invoice) {
    try {
      invoice = await issueInvoice({ ...src, booking: b }, { collection: "paid_out_of_band" });
    } catch (e) {
      // The booking is confirmed and paid; a missing receipt is a finance follow-up, not a failure.
      log.error("stripe.invoice.receipt_failed", { requestId, reference: b.reference, error: String(e) });
    }
  }

  await sendBookingConfirmed(b, ctx.listing.name, payment, invoice, ctx.checkinOffsetHours, requestId);
  await slack(
    "bookings",
    `:white_check_mark: ${b.reference} confirmed · ${ctx.listing.name} · ${b.check_in} → ${b.check_out}` +
      (ha.status === "skipped" ? " · Hostaway write skipped (non-production)" : ""),
  );
  return { status: "CONFIRMED", note: `hostaway=${ha.status} invoice=${invoice?.number ?? "none"}` };
}
