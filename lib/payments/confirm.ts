/**
 * APPROVED → CONFIRMED — spec §10.1 invariant 4, §10.2 steps 13–21, §11.1, §6.7, §17.2.
 *
 * Runs as the system actor from four places: right after ops approve, from the
 * Stripe webhook when an authorisation or payment lands, from the drain job on
 * retry, and from the pay-return route. Every step is idempotent, so running it
 * twice (or after a crash halfway) is safe: the Hostaway write is keyed on the
 * booking, capture on the PaymentIntent, invoices on the booking, and the
 * transition checks status first.
 *
 * Order, per the spec (money is never taken for a stay that is not in Hostaway):
 *
 *   A. money secured?   mode A/B: a live authorisation (or a capture already made);
 *                       mode C: the credit check passed at approval.
 *                       Not secured → AWAITING_PAYMENT, partner asked to pay.
 *   B. Hostaway write   POST /reservations (outbox). Transient failure → stay
 *                       APPROVED, retried by the drain job, ops alerted after
 *                       5 minutes. Unrecoverable → FAILED, authorisation voided,
 *                       ops paged (Appendix B).
 *   C. capture          mode A: full amount; mode B: the deposit only.
 *                       Failure here (§17.2 "capture fails after reservation
 *                       created") → CRITICAL to finance, AWAITING_PAYMENT, the
 *                       reservation is kept. Mode C: issue the net-terms invoice.
 *   D. CONFIRMED        confirmed_at set, hold released (RPC).
 *   E. paperwork        receipt / deposit receipt + balance invoice; emails; Slack.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow, InvoiceRow, PaymentRow } from "@/lib/db/types";
import { assertTransition, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { todayIn } from "@/lib/domain/dates";
import {
  balanceDueDate,
  depositPctFor,
  depositSplit,
  invoiceDaysFor,
  paymentModeFor,
  type PaymentMode,
} from "@/lib/domain/payments";
import type { QuoteLine } from "@/lib/domain/quote-engine";
import { ensureHostawayReservation } from "@/lib/hostaway/reservations";
import { alertCritical, slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { loadOrgBilling } from "./customers";
import {
  captureBookingPayment,
  latestPayment,
  loadBookingAdmin,
  paymentState,
  voidBookingAuthorisations,
} from "./intents";
import {
  invoiceForBooking,
  issueBalanceInvoice,
  issueDepositReceipt,
  issueInvoice,
  type InvoiceSource,
} from "./invoices";
import { sendBookingConfirmed, sendPaymentRequired } from "./notify";

export type ConfirmTrigger = "approval" | "webhook" | "job";
export interface ConfirmOutcome {
  status: BookingStatus;
  note: string;
}

const BOOKING_TZ = "Australia/Melbourne";

export async function systemTransition(
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
  const [listing, quote, settings] = await Promise.all([
    db.from("listings").select("public_name, hostaway_listing_id").eq("id", b.listing_id).single(),
    b.quote_id
      ? db.from("quotes").select("line_items, tax_cents, total_cents").eq("id", b.quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("settings")
      .select("key, value")
      .in("key", ["checkin.release_offset_hours", "deposit.default_pct", "deposit.balance_due_days_before_checkin"]),
  ]);
  if (!listing.data) throw new Error("listing missing for booking");
  const setting = (k: string) => settings.data?.find((r) => r.key === k)?.value;
  return {
    listing: { name: listing.data.public_name, hostawayListingId: listing.data.hostaway_listing_id },
    quote: quote.data
      ? {
          lines: (Array.isArray(quote.data.line_items) ? quote.data.line_items : []) as unknown as QuoteLine[],
          taxCents: quote.data.tax_cents,
          totalCents: quote.data.total_cents,
        }
      : null,
    checkinOffsetHours: Number(setting("checkin.release_offset_hours") ?? 48) || 48,
    depositDefaultPct: setting("deposit.default_pct"),
    balanceDueDaysBefore: Number(setting("deposit.balance_due_days_before_checkin") ?? 14) || 14,
  };
}

/** Mode A/B money check: is there an authorisation to capture, or a capture already made? */
function moneySecured(payment: PaymentRow | null): boolean {
  const s = paymentState(payment);
  return s === "authorised" || s === "captured";
}

async function askForPayment(b: BookingRequestRow, propertyName: string, reason: string, requestId: string) {
  const row =
    b.status === "APPROVED"
      ? await systemTransition(b, "AWAITING_PAYMENT", { reason, metadata: { step: "money" } })
      : b;
  await sendPaymentRequired(row, propertyName, reason, requestId);
  return row;
}

export async function confirmBooking(
  bookingId: string,
  requestId: string,
  trigger: ConfirmTrigger,
): Promise<ConfirmOutcome> {
  let b = await loadBookingAdmin(bookingId);
  if (b.status !== "APPROVED" && b.status !== "AWAITING_PAYMENT") return { status: b.status, note: "nothing to do" };

  const org = await loadOrgBilling(b.org_id);
  const mode: PaymentMode = paymentModeFor(org.payment_terms);
  const ctx = await loadContext(b);
  const src: InvoiceSource = { booking: b, org, propertyName: ctx.listing.name, quote: ctx.quote };

  // A. Money secured before anything touches Hostaway.
  let payment: PaymentRow | null = null;
  if (mode !== "invoice") {
    payment = await latestPayment(b.id);
    if (!moneySecured(payment)) {
      if (b.status === "AWAITING_PAYMENT") return { status: b.status, note: "awaiting partner payment" };
      b = await askForPayment(
        b,
        ctx.listing.name,
        "The card hold placed at request time has lapsed or was never completed.",
        requestId,
      );
      await slack("bookings", `:warning: ${b.reference} approved but no live card hold. Partner asked to pay.`);
      return { status: "AWAITING_PAYMENT", note: "no live authorisation" };
    }
  }

  // B. Inventory: the Hostaway reservation (outbox, idempotent, never retried blindly).
  const ha = await ensureHostawayReservation(b, ctx.listing, requestId);
  if (ha.status === "failed") {
    if (ha.transient) {
      // Stay APPROVED/AWAITING_PAYMENT; the drain job retries and alerts ops after the configured window.
      log.warn("booking.confirm.hostaway_transient", { requestId, reference: b.reference, reason: ha.reason });
      return { status: b.status, note: `hostaway: ${ha.reason} (will retry)` };
    }
    // Unrecoverable (Hostaway rejected the write): Appendix B APPROVED → FAILED, void, page ops.
    b = await systemTransition(b, "FAILED", {
      reason: `hostaway write failed: ${ha.reason}`,
      metadata: { hostaway: ha.reason, step: "reservation" },
    });
    await voidBookingAuthorisations(b.id, "hostaway write failed");
    await alertCritical("Hostaway reservation write failed — booking FAILED, authorisation voided", {
      reference: b.reference,
      reason: ha.reason,
      requestId,
    });
    return { status: "FAILED", note: `hostaway: ${ha.reason}` };
  }
  b = await loadBookingAdmin(b.id);

  // C. Money moves only now that the inventory is committed.
  let invoice: InvoiceRow | null = null;
  let depositCents: number | null = null;
  let depositPct: number | null = null;
  if (mode === "invoice") {
    invoice =
      (await invoiceForBooking(b.id, "net_terms")) ??
      (await issueInvoice(src, { collection: "send_invoice", daysUntilDue: invoiceDaysFor(org.payment_terms) }));
  } else {
    if (mode === "deposit") {
      depositPct = depositPctFor(org.deposit_pct, ctx.depositDefaultPct);
      depositCents = b.payment_deposit_cents ?? depositSplit(b.total_cents ?? 0, depositPct).depositCents;
    }
    if (payment?.status !== "succeeded") {
      const cap = await captureBookingPayment(b.id, {
        amountCents: depositCents ?? undefined,
        kind: mode === "deposit" ? "deposit" : "full",
      });
      if (!cap.ok) {
        // §17.2 "Capture fails after Hostaway reservation was created": CRITICAL, finance paged,
        // booking AWAITING_PAYMENT, reservation retained so the inventory stays protected.
        const reason =
          cap.code === "no_authorisation"
            ? "The card hold placed at request time has lapsed or was never completed."
            : `The card could not be charged (${cap.message}).`;
        b = await askForPayment(b, ctx.listing.name, reason, requestId);
        await alertCritical("Capture failed after the Hostaway reservation was created", {
          reference: b.reference,
          reservationId: ha.status === "skipped" ? null : ha.reservationId,
          captureError: cap.code,
          message: cap.message,
          action: "Finance to decide: retry capture, switch to invoice, or cancel. Do NOT auto-cancel the reservation.",
          requestId,
        });
        return { status: "AWAITING_PAYMENT", note: `capture failed: ${cap.message}` };
      }
      payment = cap.row;
      if (depositCents != null && depositCents !== cap.capturedCents) depositCents = cap.capturedCents;
    } else if (mode === "deposit" && depositCents == null) {
      depositCents = payment.amount_captured_cents;
    }
  }

  // D. CONFIRMED. Both sides are now true: inventory written, money captured or invoiced.
  // The approve request and the Stripe webhook can both get here for the same booking;
  // whichever makes the transition does the paperwork, the other stands down.
  b = await loadBookingAdmin(b.id);
  if (b.status === "CONFIRMED") return { status: "CONFIRMED", note: "already confirmed by a concurrent run" };
  try {
    b = await systemTransition(b, "CONFIRMED", {
      reason: `confirmed via ${trigger}`,
      metadata: {
        hostaway: ha.status,
        ...(ha.status === "created" || ha.status === "existing" ? { reservationId: ha.reservationId } : {}),
        paymentIntentId: payment?.stripe_payment_intent_id ?? null,
        invoiceNumber: invoice?.number ?? null,
        mode,
        ...(depositCents != null ? { depositCents } : {}),
      },
    });
  } catch (e) {
    const now = await loadBookingAdmin(b.id);
    if (now.status === "CONFIRMED") return { status: "CONFIRMED", note: "confirmed by a concurrent run" };
    throw e;
  }

  // E. Paperwork: never fails the confirmation; a missing receipt is a finance follow-up.
  const paperSrc: InvoiceSource = { ...src, booking: b };
  try {
    if (mode === "card_authorise" && !invoice) {
      invoice = await issueInvoice(paperSrc, { collection: "paid_out_of_band" });
    } else if (mode === "deposit" && depositCents != null) {
      const receipt = await issueDepositReceipt(paperSrc, depositCents, depositPct ?? 0);
      const dueDate = balanceDueDate(b.check_in, ctx.balanceDueDaysBefore, todayIn(BOOKING_TZ));
      const balance =
        (b.total_cents ?? 0) - depositCents > 0 ? await issueBalanceInvoice(paperSrc, { depositCents, dueDate }) : null;
      await adminDb()
        .from("booking_requests")
        .update({
          payment_deposit_cents: depositCents,
          balance_due_at: balance?.due_at ?? null,
          balance_paid_at: balance ? null : new Date().toISOString(),
        })
        .eq("id", b.id);
      invoice = balance ?? receipt;
    }
  } catch (e) {
    log.error("stripe.invoice.paperwork_failed", { requestId, reference: b.reference, error: String(e) });
  }

  await sendBookingConfirmed(b, ctx.listing.name, payment, invoice, ctx.checkinOffsetHours, requestId);
  await slack(
    "bookings",
    `:white_check_mark: ${b.reference} confirmed · ${ctx.listing.name} · ${b.check_in} → ${b.check_out}` +
      (ha.status === "skipped" ? " · Hostaway write skipped (writes disabled here)" : "") +
      (mode === "deposit" ? ` · deposit captured, balance invoiced` : ""),
  );
  return { status: "CONFIRMED", note: `hostaway=${ha.status} invoice=${invoice?.number ?? "none"}` };
}
