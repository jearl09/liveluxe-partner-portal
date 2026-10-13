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
import { BookingCancelled, BookingConfirmed, PaymentRequired } from "@/lib/notifications/templates/payment";
import {
  CardDeclined,
  CheckinReady,
  HoldReleased,
  ModificationDecided,
  ResumePayment,
  StillReviewing,
} from "@/lib/notifications/templates/payment-events";
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

type EventKind =
  "card_declined" | "resume_payment" | "hold_released" | "still_reviewing" | "checkin_ready" | "modification";

async function sendEvent(
  kind: EventKind,
  b: BookingRequestRow,
  requestId: string,
  build: (to: string) => Parameters<typeof sendEmail>[0],
) {
  try {
    const to = await recipientForBooking(b);
    if (!to) return false;
    await sendEmail(build(to));
    return true;
  } catch (e) {
    log.warn("payment.notify_failed", { requestId, kind, reference: b.reference, error: String(e) });
    return false;
  }
}

const payUrl = (b: BookingRequestRow) => `${env().NEXT_PUBLIC_APP_URL}/requests/${b.id}/pay`;
const requestUrl = (b: BookingRequestRow) => `${env().NEXT_PUBLIC_APP_URL}/requests/${b.id}`;
const holdLabel = (b: BookingRequestRow) => (b.hold_expires_at ? formatTimestamp(b.hold_expires_at) : null);

/** §17.2 "Card authorisation fails": once per failure (keyed on the intent + failure code). */
export function sendCardDeclined(
  b: BookingRequestRow,
  propertyName: string,
  args: { paymentIntentId: string; failureCode: string | null; reasonText: string },
  requestId: string,
) {
  return sendEvent("card_declined", b, requestId, (to) => ({
    to,
    subject: `Card not authorised — ${b.reference}`,
    idempotencyKey: `card_declined:${args.paymentIntentId}:${args.failureCode ?? "unknown"}`,
    tags: { type: "card_declined" },
    template: CardDeclined({
      ...common(b, propertyName),
      reasonText: args.reasonText,
      payUrl: payUrl(b),
      holdUntilLabel: holdLabel(b),
    }),
  }));
}

/** §17.2 "3DS challenge abandoned": one resume link per intent. */
export function sendResumePayment(
  b: BookingRequestRow,
  propertyName: string,
  paymentIntentId: string,
  requestId: string,
) {
  return sendEvent("resume_payment", b, requestId, (to) => ({
    to,
    subject: `Finish securing your request — ${b.reference}`,
    idempotencyKey: `resume_payment:${paymentIntentId}`,
    tags: { type: "resume_payment" },
    template: ResumePayment({ ...common(b, propertyName), payUrl: payUrl(b), holdUntilLabel: holdLabel(b) }),
  }));
}

/** §17.2 "Authorisation expires before approval". */
export function sendHoldReleased(
  b: BookingRequestRow,
  propertyName: string,
  paymentIntentId: string,
  requestId: string,
) {
  return sendEvent("hold_released", b, requestId, (to) => ({
    to,
    subject: `Card hold released — ${b.reference}`,
    idempotencyKey: `hold_released:${paymentIntentId}`,
    tags: { type: "hold_released" },
    template: HoldReleased({
      ...common(b, propertyName),
      payUrl: payUrl(b),
      approved: b.status === "APPROVED" || b.status === "AWAITING_PAYMENT",
      holdUntilLabel: holdLabel(b),
    }),
  }));
}

/** §17.5 "Nobody approves a request": hold auto-extended at 150 % of the SLA. */
export function sendStillReviewing(b: BookingRequestRow, propertyName: string, requestId: string) {
  return sendEvent("still_reviewing", b, requestId, (to) => ({
    to,
    subject: `Still with us — ${b.reference}`,
    idempotencyKey: `still_reviewing:${b.id}:${b.sla_extended_at ?? ""}`,
    tags: { type: "still_reviewing" },
    template: StillReviewing({ ...common(b, propertyName), requestUrl: requestUrl(b), holdUntilLabel: holdLabel(b) }),
  }));
}

/** §10.6 check-in pack released. */
export function sendCheckinReady(b: BookingRequestRow, propertyName: string, requestId: string) {
  return sendEvent("checkin_ready", b, requestId, (to) => ({
    to,
    subject: `Check-in details ready — ${b.reference}`,
    idempotencyKey: `checkin_ready:${b.id}:${b.checkin_released_at ?? ""}`,
    tags: { type: "checkin_ready" },
    template: CheckinReady({ ...common(b, propertyName), requestUrl: requestUrl(b), guestName: b.guest_name }),
  }));
}

/** §10.6 extension / early departure decided. */
export function sendModificationDecided(
  b: BookingRequestRow,
  propertyName: string,
  args: {
    modificationId: string;
    kind: "extension" | "early_departure";
    approved: boolean;
    newCheckOut: string;
    moneyLabel: string;
    note: string | null;
    invoiceUrl: string | null;
  },
  requestId: string,
) {
  return sendEvent("modification", b, requestId, (to) => ({
    to,
    subject: `${args.approved ? "Approved" : "Not approved"}: ${args.kind === "extension" ? "extension" : "early departure"} — ${b.reference}`,
    idempotencyKey: `modification:${args.modificationId}:${args.approved ? "approved" : "declined"}`,
    tags: { type: "modification_decided" },
    template: ModificationDecided({ ...common(b, propertyName), ...args, requestUrl: requestUrl(b) }),
  }));
}
