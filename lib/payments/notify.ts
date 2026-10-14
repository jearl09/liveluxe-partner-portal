/**
 * Partner emails driven by payment events (Appendix D, §12.2). These run from
 * webhooks and jobs where there is no user session, so they read through the
 * service role and send to the user who created the request. Never throw.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow, InvoiceRow, PaymentRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/domain/money";
import { sendEmail } from "@/lib/notifications/email";
import { CheckinPackReleased } from "@/lib/notifications/templates/checkin";
import { BookingCancelled, BookingConfirmed, PaymentRequired } from "@/lib/notifications/templates/payment";
import { log } from "@/lib/observability/logger";
import { formatDate, formatTimestamp } from "@/lib/utils";

export async function recipientForBooking(b: BookingRequestRow): Promise<string | null> {
  const { data } = await adminDb().from("partner_users").select("email, status").eq("id", b.created_by).maybeSingle();
  return data && data.status === "active" ? data.email : null;
}

function common(b: BookingRequestRow, propertyName: string) {
  return {
    reference: b.reference,
    propertyName,
    checkIn: formatDate(b.check_in),
    checkOut: formatDate(b.check_out),
    nights: b.nights,
    supportEmail: env().EMAIL_REPLY_TO,
  };
}

export async function sendPaymentRequired(
  b: BookingRequestRow,
  propertyName: string,
  reason: string,
  requestId: string,
) {
  try {
    const to = await recipientForBooking(b);
    if (!to) return;
    await sendEmail({
      to,
      subject: `Payment needed — ${b.reference}`,
      idempotencyKey: `payment_required:${b.id}:${b.updated_at}`,
      tags: { type: "payment_required" },
      template: PaymentRequired({
        ...common(b, propertyName),
        totalFormatted: b.total_cents != null ? formatMoney(b.total_cents, b.currency) : "see portal",
        reason,
        payUrl: `${env().NEXT_PUBLIC_APP_URL}/requests/${b.id}/pay`,
        holdUntilLabel: b.hold_expires_at ? formatTimestamp(b.hold_expires_at) : null,
      }),
    });
  } catch (e) {
    log.warn("payment.notify_failed", {
      requestId,
      kind: "payment_required",
      reference: b.reference,
      error: String(e),
    });
  }
}

export function paymentLabel(payment: PaymentRow | null, invoice: InvoiceRow | null): string {
  if (payment?.status === "succeeded") {
    const card = payment.card_last4
      ? `${payment.card_brand ? payment.card_brand[0].toUpperCase() + payment.card_brand.slice(1) : "card"} ending ${payment.card_last4}`
      : "card";
    return `Paid by ${card}${invoice?.number ? ` (invoice ${invoice.number})` : ""}`;
  }
  if (invoice) {
    const due = invoice.due_at ? ` due ${formatDate(invoice.due_at.slice(0, 10))}` : "";
    return `Invoice ${invoice.number ?? ""}${due}`.trim();
  }
  return "See portal";
}

export async function sendBookingConfirmed(
  b: BookingRequestRow,
  propertyName: string,
  payment: PaymentRow | null,
  invoice: InvoiceRow | null,
  checkinOffsetHours: number,
  requestId: string,
) {
  try {
    const to = await recipientForBooking(b);
    if (!to) return;
    await sendEmail({
      to,
      subject: `Confirmed — ${b.reference}`,
      idempotencyKey: `booking_confirmed:${b.id}`,
      tags: { type: "booking_confirmed" },
      template: BookingConfirmed({
        ...common(b, propertyName),
        guestName: b.guest_name,
        totalFormatted: b.total_cents != null ? formatMoney(b.total_cents, b.currency) : "see portal",
        paymentLabel: paymentLabel(payment, invoice),
        invoiceUrl: invoice?.hosted_url ?? invoice?.pdf_url ?? null,
        requestUrl: `${env().NEXT_PUBLIC_APP_URL}/requests/${b.id}`,
        checkinReleaseLabel: `Check-in details are released in the portal ${checkinOffsetHours} hours before arrival.`,
      }),
    });
  } catch (e) {
    log.warn("payment.notify_failed", {
      requestId,
      kind: "booking_confirmed",
      reference: b.reference,
      error: String(e),
    });
  }
}

export async function sendBookingCancelled(
  b: BookingRequestRow,
  propertyName: string,
  input: { cancelledBy: "partner" | "livluxe"; reason: string | null; moneyLabel: string },
  requestId: string,
) {
  try {
    const to = await recipientForBooking(b);
    if (!to) return;
    await sendEmail({
      to,
      subject: `Cancelled — ${b.reference}`,
      idempotencyKey: `booking_cancelled:${b.id}:${b.cancelled_at ?? ""}`,
      tags: { type: "booking_cancelled" },
      template: BookingCancelled({
        ...common(b, propertyName),
        cancelledBy: input.cancelledBy === "partner" ? "Your organisation" : "Live Luxe",
        reason: input.reason,
        moneyLabel: input.moneyLabel,
        requestUrl: `${env().NEXT_PUBLIC_APP_URL}/requests/${b.id}`,
      }),
    });
  } catch (e) {
    log.warn("payment.notify_failed", {
      requestId,
      kind: "booking_cancelled",
      reference: b.reference,
      error: String(e),
    });
  }
}

/** Appendix D "Check-in pack released": address and link only; codes stay behind login (§8.4). */
export async function sendCheckinPackReleased(b: BookingRequestRow, propertyName: string, requestId: string) {
  try {
    const to = await recipientForBooking(b);
    if (!to) return;
    const { data: l } = await adminDb()
      .from("listings")
      .select("address_line, suburb, state, postcode, checkin_from, checkin_to, checkout_by")
      .eq("id", b.listing_id)
      .maybeSingle();
    const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
    const addressLine = l
      ? [l.address_line, [l.suburb, l.state, l.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null
      : null;
    await sendEmail({
      to,
      subject: `Check-in details ready — ${b.reference}`,
      idempotencyKey: `checkin_released:${b.id}:${b.checkin_released_at ?? ""}`,
      tags: { type: "checkin_released" },
      template: CheckinPackReleased({
        ...common(b, propertyName),
        guestName: b.guest_name,
        addressLine,
        arrivalWindow: hhmm(l?.checkin_from)
          ? `from ${hhmm(l?.checkin_from)}${hhmm(l?.checkin_to) ? ` to ${hhmm(l?.checkin_to)}` : ""}`
          : null,
        checkoutBy: hhmm(l?.checkout_by),
        requestUrl: `${env().NEXT_PUBLIC_APP_URL}/requests/${b.id}`,
      }),
    });
  } catch (e) {
    log.warn("payment.notify_failed", {
      requestId,
      kind: "checkin_released",
      reference: b.reference,
      error: String(e),
    });
  }
}
