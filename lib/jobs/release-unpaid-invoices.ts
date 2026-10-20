/**
 * release-unpaid-invoices — a confirmed net-terms booking whose invoice is still unpaid on its
 * due date is released (David, 20 Oct 2026). The due date is already no later than
 * `invoice.due_days_before_checkin` before check-in (lib/domain/payments invoiceDaysUntilDue).
 *
 *   warn     `invoice.release_warning_days` before the due date: one email to the booker and the
 *            org's billing contact, stamped on invoices.release_warned_at
 *   release  on the due date: CONFIRMED → CANCELLED as the system, Hostaway reservation cancelled,
 *            invoice voided, partner emailed, ops told on Slack
 *
 * Ordinary dunning (reminders, finance approval, suspension) carries on for invoices of stays
 * that have already started. Runs daily; each booking is its own try/catch.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow, InvoiceRow } from "@/lib/db/types";
import { assertTransition } from "@/lib/domain/booking-state-machine";
import { todayIn } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { parseReleaseWarningDays, unpaidInvoiceAction } from "@/lib/domain/payments";
import { partnerPropertyName } from "@/lib/domain/property-name";
import { env } from "@/lib/env";
import { cancelHostawayReservation } from "@/lib/hostaway/reservations";
import { sendEmail } from "@/lib/notifications/email";
import { slack } from "@/lib/notifications/slack";
import { InvoiceReleaseWarning } from "@/lib/notifications/templates/dunning";
import { log } from "@/lib/observability/logger";
import { recipientForBooking, sendBookingCancelled } from "@/lib/payments/notify";
import { creditInvoiceForCancellation } from "@/lib/payments/refunds";
import { formatDate } from "@/lib/utils";
import type { JobFn } from "./registry";

const BOOKING_TZ = "Australia/Melbourne";
export const UNPAID_RELEASE_REASON = "Invoice unpaid by the due date; booking released";

type ListingName = { id: string; public_name: string; internal_name: string | null };

async function warn(
  inv: InvoiceRow,
  b: BookingRequestRow,
  name: string,
  now: Date,
  requestId: string,
): Promise<boolean> {
  const db = adminDb();
  const [{ data: org }, booker] = await Promise.all([
    db.from("partner_orgs").select("billing_email").eq("id", b.org_id).maybeSingle(),
    recipientForBooking(b),
  ]);
  const to = [...new Set([booker, org?.billing_email].filter((x): x is string => !!x))];
  if (!to.length) {
    log.warn("release_unpaid.no_recipient", { requestId, reference: b.reference, invoice: inv.number });
    return false;
  }
  const dueLabel = formatDate(inv.due_at!.slice(0, 10));
  await sendEmail({
    to,
    subject: `Invoice ${inv.number ?? ""} is due ${dueLabel} — booking ${b.reference} is released if unpaid`.replace(
      "  ",
      " ",
    ),
    idempotencyKey: `invoice_release_warning:${inv.id}`,
    tags: { type: "invoice_release_warning" },
    template: InvoiceReleaseWarning({
      reference: b.reference,
      propertyName: name,
      invoiceNumber: inv.number ?? inv.stripe_invoice_id,
      amountFormatted: formatMoney(inv.amount_due_cents - inv.amount_paid_cents, inv.currency),
      dueLabel,
      checkInLabel: formatDate(b.check_in),
      payUrl: inv.hosted_url ?? `${env().NEXT_PUBLIC_APP_URL}/invoices`,
      supportEmail: env().EMAIL_REPLY_TO,
    }),
  });
  await db.from("invoices").update({ release_warned_at: now.toISOString() }).eq("id", inv.id);
  log.info("release_unpaid.warned", { requestId, reference: b.reference, invoice: inv.number, dueAt: inv.due_at });
  return true;
}

async function release(inv: InvoiceRow, b: BookingRequestRow, name: string, requestId: string): Promise<void> {
  const db = adminDb();
  // 1. State first (§6.7 ordering): the booking is released whatever happens to Hostaway or Stripe.
  assertTransition(b.status, "CANCELLED", "system");
  const { data: moved, error } = await db.rpc("apply_booking_transition", {
    p_booking_id: b.id,
    p_expected_from: b.status,
    p_to: "CANCELLED",
    p_reason: UNPAID_RELEASE_REASON,
    p_metadata: { kind: "unpaid_invoice", invoiceId: inv.id, invoiceNumber: inv.number, dueAt: inv.due_at } as never,
  });
  if (error) throw new Error(error.message);
  let cancelled = (moved ?? b) as BookingRequestRow;

  // 2. Inventory: free the nights.
  const ha = await cancelHostawayReservation(cancelled, requestId);

  // 3. Money: nothing was paid, so the invoice is voided (nothing retained).
  const credit = await creditInvoiceForCancellation({
    invoice: inv,
    bookingReference: cancelled.reference,
    refundCents: 0,
    retainedCents: 0,
    stripeRefundId: null,
    reason: UNPAID_RELEASE_REASON,
  });

  // 4. Record the outcome on the booking for both screens.
  const { data: updated } = await db
    .from("booking_requests")
    .update({ cancellation_reason: UNPAID_RELEASE_REASON, cancel_refund_cents: 0, cancel_retained_cents: 0 })
    .eq("id", cancelled.id)
    .select("*")
    .single();
  if (updated) cancelled = updated;

  // 5. Tell people.
  await sendBookingCancelled(
    cancelled,
    name,
    {
      cancelledBy: "livluxe",
      reason: UNPAID_RELEASE_REASON,
      moneyLabel: credit.voided
        ? "The invoice has been voided; nothing is payable."
        : "The invoice is being voided by Live Luxe finance; nothing is payable.",
    },
    requestId,
  );
  await slack(
    "bookings",
    `:x: ${cancelled.reference} released: invoice ${inv.number ?? inv.stripe_invoice_id} (${formatMoney(inv.amount_due_cents - inv.amount_paid_cents, inv.currency)}) unpaid at its due date · ${name} · ${cancelled.check_in} → ${cancelled.check_out}` +
      (ha.status === "skipped"
        ? " · Hostaway cancel skipped (non-production)"
        : ha.status === "failed"
          ? ` · Hostaway cancel FAILED (${ha.reason})`
          : "") +
      (credit.voided ? " · invoice voided" : " · invoice NOT voided, finance to check"),
  );
  if (ha.status === "failed" || !credit.voided)
    await slack(
      "alerts",
      `:rotating_light: ${cancelled.reference} released for non-payment but ${ha.status === "failed" ? "the Hostaway reservation is still in place" : "the invoice could not be voided"}. Please finish it by hand.`,
    );
  log.warn("release_unpaid.released", {
    requestId,
    reference: cancelled.reference,
    invoice: inv.number,
    hostaway: ha.status,
    invoiceVoided: credit.voided,
  });
}

export const releaseUnpaidInvoices: JobFn = async ({ requestId }) => {
  const db = adminDb();
  const now = new Date();
  const today = todayIn(BOOKING_TZ);
  const [{ data: setting }, { data: invoices, error }] = await Promise.all([
    db.from("settings").select("value").eq("key", "invoice.release_warning_days").maybeSingle(),
    db.from("invoices").select("*").eq("kind", "net_terms").eq("status", "open").limit(500),
  ]);
  if (error) throw new Error(`invoices read failed: ${error.message}`);
  const warningDays = parseReleaseWarningDays(setting?.value);
  const open = (invoices ?? []).filter((i) => i.booking_id && i.due_at && i.amount_due_cents - i.amount_paid_cents > 0);

  const bookingIds = [...new Set(open.map((i) => i.booking_id!))];
  const { data: bookings } = bookingIds.length
    ? await db.from("booking_requests").select("*").in("id", bookingIds).eq("status", "CONFIRMED")
    : { data: [] as BookingRequestRow[] };
  const byBooking = new Map((bookings ?? []).map((b) => [b.id, b]));
  const listingIds = [...new Set((bookings ?? []).map((b) => b.listing_id))];
  const { data: listings } = listingIds.length
    ? await db.from("listings").select("id, public_name, internal_name").in("id", listingIds)
    : { data: [] as ListingName[] };
  const names = new Map((listings ?? []).map((l) => [l.id, partnerPropertyName(l.public_name, l.internal_name)]));

  let warned = 0;
  let released = 0;
  let failed = 0;
  for (const inv of open) {
    const b = byBooking.get(inv.booking_id!);
    if (!b) continue;
    const action = unpaidInvoiceAction({
      bookingStatus: b.status,
      invoiceStatus: inv.status,
      dueAt: inv.due_at,
      outstandingCents: inv.amount_due_cents - inv.amount_paid_cents,
      checkIn: b.check_in,
      today,
      warnedAt: inv.release_warned_at ?? null,
      now,
      warningDays,
    });
    if (action === "none") continue;
    const name = names.get(b.listing_id) ?? "the property";
    try {
      if (action === "warn") {
        if (await warn(inv, b, name, now, requestId)) warned++;
      } else {
        await release(inv, b, name, requestId);
        released++;
      }
    } catch (e) {
      failed++;
      log.error("release_unpaid.failed", { requestId, reference: b.reference, action, error: String(e) });
    }
  }
  return {
    examined: open.length,
    changed: warned + released,
    notes: `warned=${warned} released=${released} failed=${failed}`,
  };
};
