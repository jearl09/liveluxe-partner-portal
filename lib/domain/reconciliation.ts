/**
 * Financial reconciliation — spec §11.6. Pure: the job feeds it the platform's
 * rows and Stripe's balance transactions; this module matches them, asserts the
 * three invariants, builds the finance report and the CSV export.
 *
 *   • every CONFIRMED booking has a captured payment or an issued invoice
 *   • every captured payment has a confirmed booking
 *   • every refund has an approving actor
 *   • every Stripe balance transaction in the period matches a local row, and vice versa
 */

export interface ReconBooking {
  id: string;
  reference: string;
  status: string;
  confirmedAt: string | null;
}
export interface ReconPayment {
  bookingId: string;
  paymentIntentId: string;
  status: string;
  capturedCents: number;
  capturedAt: string | null;
  authorisedAt: string | null;
}
export interface ReconInvoice {
  bookingId: string | null;
  invoiceId: string;
  status: string;
  paidCents: number;
  dueCents: number;
  dueAt: string | null;
  kind: string;
}
export interface ReconRefund {
  bookingId: string;
  refundId: string;
  amountCents: number;
  status: string;
  approvedBy: string | null;
}
export interface ReconDispute {
  disputeId: string;
  bookingId: string | null;
  status: string;
  amountCents: number;
}
/** A Stripe balance transaction, already resolved to the PaymentIntent / Refund it belongs to. */
export interface ReconBalanceTxn {
  id: string;
  type: string; // charge | payment | refund | payment_refund | dispute | adjustment | payout | stripe_fee | …
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  createdAt: string;
  paymentIntentId: string | null;
  refundId: string | null;
  disputeId: string | null;
  description: string | null;
}

export interface ReconException {
  kind:
    | "confirmed_without_payment"
    | "captured_without_confirmed"
    | "refund_without_approver"
    | "unmatched_balance_txn"
    | "captured_without_balance_txn"
    | "dispute_open"
    // Hostaway write-back (§17.3)
    | "duplicate_reservation"
    | "reservation_missing"
    | "cancelled_upstream_refund";
  entityType: "booking" | "payment" | "refund" | "balance_transaction" | "dispute" | "reservation";
  entityId: string;
  externalId: string | null;
  detail: Record<string, unknown>;
}

export interface ReconSummary {
  grossCents: number;
  feesCents: number;
  netCents: number;
  refundsCents: number;
  disputesCents: number;
  outstandingAuthorisations: number;
  outstandingAuthorisationsCents: number;
  overdueInvoices: number;
  overdueInvoicesCents: number;
  matchedTxns: number;
  unmatchedTxns: number;
  exceptions: number;
}

export interface ReconReport {
  summary: ReconSummary;
  exceptions: ReconException[];
  csv: string;
}

const LIVE_AFTER_CONFIRM = new Set(["CONFIRMED", "CHECKED_IN", "COMPLETED"]);
/** Statuses in which a captured payment is expected (cancelled bookings keep their capture until refunded). */
const CAPTURE_EXPECTED = new Set(["CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "AWAITING_PAYMENT"]);

export function reconcileStripe(input: {
  bookings: ReconBooking[];
  payments: ReconPayment[];
  invoices: ReconInvoice[];
  refunds: ReconRefund[];
  disputes: ReconDispute[];
  balanceTxns: ReconBalanceTxn[];
  periodFrom: string;
  periodTo: string;
  now: Date;
}): ReconReport {
  const exceptions: ReconException[] = [];
  const bookingById = new Map(input.bookings.map((b) => [b.id, b]));
  const paymentsByBooking = group(input.payments, (p) => p.bookingId);
  const invoicesByBooking = group(
    input.invoices.filter((i) => i.bookingId),
    (i) => i.bookingId!,
  );
  const paymentByPi = new Map(input.payments.map((p) => [p.paymentIntentId, p]));
  const refundById = new Map(input.refunds.map((r) => [r.refundId, r]));
  const disputeById = new Map(input.disputes.map((d) => [d.disputeId, d]));

  // 1. Every CONFIRMED booking has money behind it.
  for (const b of input.bookings) {
    if (!LIVE_AFTER_CONFIRM.has(b.status)) continue;
    const captured = (paymentsByBooking.get(b.id) ?? []).some((p) => p.status === "succeeded" && p.capturedCents > 0);
    const invoiced = (invoicesByBooking.get(b.id) ?? []).some((i) => i.status === "open" || i.status === "paid");
    if (!captured && !invoiced)
      exceptions.push({
        kind: "confirmed_without_payment",
        entityType: "booking",
        entityId: b.id,
        externalId: null,
        detail: { reference: b.reference, status: b.status, confirmedAt: b.confirmedAt },
      });
  }

  // 2. Every captured payment belongs to a booking that is (or was) confirmed.
  for (const p of input.payments) {
    if (p.status !== "succeeded" || p.capturedCents <= 0) continue;
    const b = bookingById.get(p.bookingId);
    if (!b || !CAPTURE_EXPECTED.has(b.status))
      exceptions.push({
        kind: "captured_without_confirmed",
        entityType: "payment",
        entityId: p.paymentIntentId,
        externalId: p.paymentIntentId,
        detail: {
          bookingId: p.bookingId,
          reference: b?.reference ?? null,
          status: b?.status ?? "missing",
          capturedCents: p.capturedCents,
        },
      });
  }

  // 3. Every refund has an approving actor.
  for (const r of input.refunds) {
    if (r.status === "failed" || r.status === "canceled") continue;
    if (!r.approvedBy)
      exceptions.push({
        kind: "refund_without_approver",
        entityType: "refund",
        entityId: r.refundId,
        externalId: r.refundId,
        detail: {
          bookingId: r.bookingId,
          amountCents: r.amountCents,
          reference: bookingById.get(r.bookingId)?.reference ?? null,
        },
      });
  }

  // 4. Stripe's money trail matches ours.
  let gross = 0,
    fees = 0,
    net = 0,
    refundsTotal = 0,
    disputesTotal = 0,
    matched = 0,
    unmatched = 0;
  const seenPis = new Set<string>();
  const rows: string[][] = [];
  for (const t of input.balanceTxns) {
    let local: { kind: string; bookingRef: string | null } | null = null;
    if (t.refundId && refundById.has(t.refundId)) {
      const r = refundById.get(t.refundId)!;
      local = { kind: "refund", bookingRef: bookingById.get(r.bookingId)?.reference ?? null };
    } else if (t.paymentIntentId && paymentByPi.has(t.paymentIntentId)) {
      const p = paymentByPi.get(t.paymentIntentId)!;
      seenPis.add(p.paymentIntentId);
      local = { kind: "payment", bookingRef: bookingById.get(p.bookingId)?.reference ?? null };
    } else if (t.disputeId && disputeById.has(t.disputeId)) {
      const d = disputeById.get(t.disputeId)!;
      local = { kind: "dispute", bookingRef: d.bookingId ? (bookingById.get(d.bookingId)?.reference ?? null) : null };
    } else if (t.type === "payout" || t.type === "stripe_fee" || t.type === "adjustment" || t.type === "transfer") {
      local = { kind: t.type, bookingRef: null }; // platform-level movements, not booking money
    }

    if (t.type === "refund" || t.type === "payment_refund") refundsTotal += Math.abs(t.amountCents);
    else if (t.type === "dispute") disputesTotal += Math.abs(t.amountCents);
    else if (t.type === "charge" || t.type === "payment") gross += t.amountCents;
    fees += t.feeCents;
    net += t.netCents;

    if (local) matched++;
    else {
      unmatched++;
      exceptions.push({
        kind: "unmatched_balance_txn",
        entityType: "balance_transaction",
        entityId: t.id,
        externalId: t.id,
        detail: { type: t.type, amountCents: t.amountCents, createdAt: t.createdAt, description: t.description },
      });
    }
    rows.push([
      t.createdAt.slice(0, 10),
      t.type,
      local?.bookingRef ?? "",
      t.description ?? "",
      cents(t.amountCents),
      cents(t.feeCents),
      cents(t.netCents),
      t.currency.toUpperCase(),
      t.id,
      t.paymentIntentId ?? t.refundId ?? t.disputeId ?? "",
      local ? "matched" : "UNMATCHED",
    ]);
  }

  // 4b. A capture inside the period with no balance transaction behind it.
  for (const p of input.payments) {
    if (p.status !== "succeeded" || !p.capturedAt) continue;
    if (p.capturedAt < input.periodFrom || p.capturedAt > input.periodTo) continue;
    if (!seenPis.has(p.paymentIntentId))
      exceptions.push({
        kind: "captured_without_balance_txn",
        entityType: "payment",
        entityId: p.paymentIntentId,
        externalId: p.paymentIntentId,
        detail: { bookingId: p.bookingId, capturedCents: p.capturedCents, capturedAt: p.capturedAt },
      });
  }

  // 5. Open disputes are always on the report.
  for (const d of input.disputes) {
    if (d.status === "won" || d.status === "lost" || d.status === "warning_closed" || d.status === "charge_refunded")
      continue;
    exceptions.push({
      kind: "dispute_open",
      entityType: "dispute",
      entityId: d.disputeId,
      externalId: d.disputeId,
      detail: { bookingId: d.bookingId, amountCents: d.amountCents, status: d.status },
    });
  }

  const outstandingAuths = input.payments.filter((p) => p.status === "requires_capture");
  const overdue = input.invoices.filter(
    (i) => i.status === "open" && i.dueAt && Date.parse(i.dueAt) < input.now.getTime() && i.dueCents - i.paidCents > 0,
  );

  const header = [
    "Date",
    "Type",
    "BookingRef",
    "Description",
    "Gross",
    "Fee",
    "Net",
    "Currency",
    "StripeTxnId",
    "StripeSourceId",
    "Match",
  ];
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

  return {
    summary: {
      grossCents: gross,
      feesCents: fees,
      netCents: net,
      refundsCents: refundsTotal,
      disputesCents: disputesTotal,
      outstandingAuthorisations: outstandingAuths.length,
      outstandingAuthorisationsCents: outstandingAuths.reduce((s, p) => s + p.capturedCents, 0),
      overdueInvoices: overdue.length,
      overdueInvoicesCents: overdue.reduce((s, i) => s + (i.dueCents - i.paidCents), 0),
      matchedTxns: matched,
      unmatchedTxns: unmatched,
      exceptions: exceptions.length,
    },
    exceptions,
    csv,
  };
}

/** §11.6: unmatched items older than the threshold raise a HIGH alert — they do not age quietly. */
export function staleExceptions<T extends { firstSeenAt: string; resolvedAt: string | null; alertedAt: string | null }>(
  items: T[],
  now: Date,
  alertAfterHours: number,
): T[] {
  const cutoff = now.getTime() - alertAfterHours * 3_600_000;
  return items.filter((x) => !x.resolvedAt && !x.alertedAt && Date.parse(x.firstSeenAt) <= cutoff);
}

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

const cents = (c: number) => (c / 100).toFixed(2);

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
