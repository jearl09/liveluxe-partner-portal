import { describe, expect, it } from "vitest";
import { reconcileStripe, staleExceptions, type ReconBalanceTxn } from "@/lib/domain/reconciliation";

const now = new Date("2026-10-13T03:45:00Z");
const period = { periodFrom: "2026-10-12T02:45:00Z", periodTo: now.toISOString(), now };
const txn = (over: Partial<ReconBalanceTxn>): ReconBalanceTxn => ({
  id: "txn_1",
  type: "charge",
  amountCents: 1000,
  feeCents: 48,
  netCents: 952,
  currency: "aud",
  createdAt: "2026-10-12T10:00:00Z",
  paymentIntentId: null,
  refundId: null,
  disputeId: null,
  description: null,
  ...over,
});

describe("§11.6 reconciliation invariants", () => {
  it("a matched day reports totals and no exceptions", () => {
    const r = reconcileStripe({
      ...period,
      bookings: [{ id: "b1", reference: "LLX-1", status: "CONFIRMED", confirmedAt: "2026-10-12T09:00:00Z" }],
      payments: [
        {
          bookingId: "b1",
          paymentIntentId: "pi_1",
          status: "succeeded",
          capturedCents: 1000,
          capturedAt: "2026-10-12T10:00:00Z",
          authorisedAt: "2026-10-12T08:00:00Z",
        },
      ],
      invoices: [],
      refunds: [],
      disputes: [],
      balanceTxns: [txn({ paymentIntentId: "pi_1" })],
    });
    expect(r.exceptions).toEqual([]);
    expect(r.summary).toMatchObject({
      grossCents: 1000,
      feesCents: 48,
      netCents: 952,
      matchedTxns: 1,
      unmatchedTxns: 0,
    });
    expect(r.csv.split("\n")[1]).toContain("LLX-1");
  });

  it("flags every invariant breach with the entity it concerns", () => {
    const r = reconcileStripe({
      ...period,
      bookings: [
        { id: "b1", reference: "LLX-1", status: "CONFIRMED", confirmedAt: null },
        { id: "b2", reference: "LLX-2", status: "UNDER_REVIEW", confirmedAt: null },
      ],
      payments: [
        {
          bookingId: "b2",
          paymentIntentId: "pi_2",
          status: "succeeded",
          capturedCents: 500,
          capturedAt: "2026-10-12T10:00:00Z",
          authorisedAt: null,
        },
      ],
      invoices: [
        {
          bookingId: null,
          invoiceId: "in_1",
          status: "open",
          paidCents: 0,
          dueCents: 700,
          dueAt: "2026-10-01T00:00:00Z",
          kind: "net_terms",
        },
      ],
      refunds: [{ bookingId: "b2", refundId: "re_1", amountCents: 100, status: "succeeded", approvedBy: null }],
      disputes: [{ disputeId: "du_1", bookingId: "b2", status: "needs_response", amountCents: 500 }],
      balanceTxns: [
        txn({ id: "txn_x", paymentIntentId: "pi_unknown" }),
        txn({ id: "txn_fee", type: "stripe_fee", amountCents: -10, feeCents: 0, netCents: -10 }),
      ],
    });
    expect(r.exceptions.map((e) => [e.kind, e.entityId])).toEqual(
      expect.arrayContaining([
        ["confirmed_without_payment", "b1"],
        ["captured_without_confirmed", "pi_2"],
        ["refund_without_approver", "re_1"],
        ["unmatched_balance_txn", "txn_x"],
        ["captured_without_balance_txn", "pi_2"],
        ["dispute_open", "du_1"],
      ]),
    );
    expect(r.summary.overdueInvoices).toBe(1);
    expect(r.summary.overdueInvoicesCents).toBe(700);
    expect(r.summary.matchedTxns).toBe(1); // the platform-level fee line is matched by type
    expect(r.csv).toContain("UNMATCHED");
  });

  it("refunds and disputes are matched by their ids and totalled; cancelled bookings may keep a capture", () => {
    const r = reconcileStripe({
      ...period,
      bookings: [{ id: "b1", reference: "LLX-1", status: "CANCELLED", confirmedAt: null }],
      payments: [
        {
          bookingId: "b1",
          paymentIntentId: "pi_1",
          status: "succeeded",
          capturedCents: 1000,
          capturedAt: "2026-10-01T00:00:00Z",
          authorisedAt: null,
        },
      ],
      invoices: [],
      refunds: [{ bookingId: "b1", refundId: "re_1", amountCents: 1000, status: "succeeded", approvedBy: "u1" }],
      disputes: [{ disputeId: "du_1", bookingId: "b1", status: "won", amountCents: 1000 }],
      balanceTxns: [
        txn({ id: "t_r", type: "refund", amountCents: -1000, feeCents: 0, netCents: -1000, refundId: "re_1" }),
        txn({ id: "t_d", type: "dispute", amountCents: -1000, feeCents: 1500, netCents: -2500, disputeId: "du_1" }),
      ],
    });
    expect(r.exceptions).toEqual([]);
    expect(r.summary.refundsCents).toBe(1000);
    expect(r.summary.disputesCents).toBe(1000);
  });

  it("stale exceptions are the unresolved, un-alerted ones older than the threshold", () => {
    const items = [
      { id: 1, firstSeenAt: "2026-10-11T00:00:00Z", resolvedAt: null, alertedAt: null },
      { id: 2, firstSeenAt: "2026-10-13T00:00:00Z", resolvedAt: null, alertedAt: null },
      { id: 3, firstSeenAt: "2026-10-11T00:00:00Z", resolvedAt: "2026-10-12T00:00:00Z", alertedAt: null },
      { id: 4, firstSeenAt: "2026-10-11T00:00:00Z", resolvedAt: null, alertedAt: "2026-10-12T00:00:00Z" },
    ];
    expect(staleExceptions(items, now, 24).map((x) => x.id)).toEqual([1]);
  });
});
