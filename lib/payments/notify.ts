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
import { BookingConfirmed, PaymentRequired } from "@/lib/notifications/templates/payment";
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
