/**
 * Spec §11.6 — nightly financial reconciliation, and §17.3 webhook receiver rows
 * (replayed / spoofed / unknown Hostaway events) against the real route handler.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/admin", () => import("./fakes/world").then((m) => m.factories.admin()));
vi.mock("@/lib/db/server", () => import("./fakes/world").then((m) => m.factories.server()));
vi.mock("@/lib/stripe/client", () => import("./fakes/world").then((m) => m.factories.stripe()));
vi.mock("@/lib/hostaway/api", () => import("./fakes/world").then((m) => m.factories.hostaway()));
vi.mock("@/lib/notifications/email", () => import("./fakes/world").then((m) => m.factories.email()));
vi.mock("@/lib/notifications/slack", () => import("./fakes/world").then((m) => m.factories.slack()));
vi.mock("@/lib/observability/logger", () => import("./fakes/world").then((m) => m.factories.logger()));

import { runStripeReconciliation } from "@/lib/jobs/reconcile-stripe";
import { confirmBooking } from "@/lib/payments/confirm";
import { cancelBooking } from "@/lib/requests/cancel";
import { approve } from "@/lib/requests/decide";
import { POST as hostawayWebhook } from "@/app/api/webhooks/hostaway/[secret]/route";
import {
  asUser,
  booking,
  claimsFor,
  enableHostawayTestWrites,
  placeHold,
  seedBooking,
  seedWorld,
  slackContaining,
  world,
} from "./fakes/world";

const REQ = "req-test";

beforeEach(async () => {
  world.reset();
  seedWorld();
  await enableHostawayTestWrites(true);
});

async function confirmed(patch: Parameters<typeof seedBooking>[0] = {}) {
  const b = seedBooking(patch);
  await placeHold(b.id);
  await approve(claimsFor("ops"), b.id, REQ);
  asUser(null);
  await confirmBooking(b.id, REQ, "approval");
  return booking(b.id);
}

describe("§11.6 reconcile-stripe", () => {
  it("a clean day: every balance transaction matches, totals reported, CSV exported, no exceptions", async () => {
    const a = await confirmed({ daysToCheckIn: 20 });
    const b = await confirmed({ daysToCheckIn: 40 });
    await cancelBooking(claimsFor("ops"), b.id, { reason: "other", note: "" }, REQ);
    const r = await runStripeReconciliation(REQ);
    expect(r.summary.matchedTxns).toBe(3); // two captures, one refund
    expect(r.summary.unmatchedTxns).toBe(0);
    expect(r.summary.grossCents).toBe(2 * 297_000);
    expect(r.summary.refundsCents).toBe(297_000);
    expect(r.summary.feesCents).toBeGreaterThan(0);
    expect(r.exceptions).toHaveLength(0);
    const run = world.db.rows<{ csv: string; exceptions: number }>("reconciliation_runs")[0];
    expect(run.exceptions).toBe(0);
    expect(run.csv.split("\n")).toHaveLength(4);
    expect(run.csv).toContain(a.reference);
    expect(run.csv).toContain("matched");
    expect(run.csv).not.toContain("UNMATCHED");
  });

  it("asserts the three invariants and raises unmatched Stripe money", async () => {
    // 1. CONFIRMED without any money behind it.
    const orphan = seedBooking({ status: "CONFIRMED", daysToCheckIn: 50, confirmed_at: new Date().toISOString() });
    // 2. A captured payment on a booking that is not confirmed (ghost capture).
    const ghost = seedBooking({ status: "UNDER_REVIEW", daysToCheckIn: 70 });
    world.db.insertRow("payments", {
      booking_id: ghost.id,
      stripe_payment_intent_id: "pi_ghost",
      status: "succeeded",
      amount_captured_cents: 1000,
      amount_authorised_cents: 1000,
      captured_at: new Date().toISOString(),
      currency: "AUD",
    });
    // 3. A refund with no approving actor.
    world.db.insertRow("refunds", {
      booking_id: ghost.id,
      stripe_refund_id: "re_noapprover",
      amount_cents: 500,
      status: "succeeded",
      approved_by: null,
    });
    // 4. Money in Stripe nobody recorded (a dashboard charge).
    world.stripe.balanceTxns.push({
      id: "txn_dash",
      object: "balance_transaction",
      type: "charge",
      amount: 12_300,
      fee: 245,
      net: 12_055,
      currency: "aud",
      created: Math.floor(Date.now() / 1000),
      source: { object: "charge", id: "ch_dash", payment_intent: "pi_dash" },
      description: "manual charge",
    });
    const r = await runStripeReconciliation(REQ);
    const kinds = r.exceptions.map((e) => e.kind).sort();
    expect(kinds).toEqual([
      "captured_without_balance_txn",
      "captured_without_confirmed",
      "confirmed_without_payment",
      "refund_without_approver",
      "unmatched_balance_txn",
    ]);
    expect(r.exceptions.find((e) => e.kind === "confirmed_without_payment")?.entityId).toBe(orphan.id);
    expect(r.summary.unmatchedTxns).toBe(1);
    expect(world.db.rows("reconciliation_exceptions")).toHaveLength(5);
    expect(slackContaining("Stripe reconciliation")[0].channel).toBe("alerts");
    // Exceptions keep their first_seen_at across runs and are resolved when they clear.
    const first = world.db
      .rows<{ kind: string; first_seen_at: string }>("reconciliation_exceptions")
      .find((e) => e.kind === "unmatched_balance_txn")!;
    world.stripe.balanceTxns.length = 0;
    await runStripeReconciliation(REQ);
    const again = world.db
      .rows<{ kind: string; first_seen_at: string; resolved_at: string | null }>("reconciliation_exceptions")
      .find((e) => e.kind === "unmatched_balance_txn")!;
    expect(again.resolved_at).toBeTruthy();
    expect(again.first_seen_at).toBe(first.first_seen_at);
  });

  it("unmatched items older than 24 h raise HIGH once (they do not age quietly)", async () => {
    seedBooking({ status: "CONFIRMED", daysToCheckIn: 50 });
    await runStripeReconciliation(REQ);
    const ex = world.db.rows<{ id: string }>("reconciliation_exceptions")[0];
    await world.db
      .from("reconciliation_exceptions")
      .update({ first_seen_at: new Date(Date.now() - 25 * 3_600_000).toISOString() })
      .eq("id", ex.id);
    const r = await runStripeReconciliation(REQ);
    expect(r.alerted).toBe(1);
    expect(slackContaining("*HIGH*")).toHaveLength(1);
    expect((await runStripeReconciliation(REQ)).alerted).toBe(0);
  });

  it("open disputes and overdue invoices are on every report", async () => {
    const b = await confirmed({ daysToCheckIn: 20 });
    const pi = (await import("@/lib/payments/intents").then((m) => m.latestPayment(b.id)))!.stripe_payment_intent_id;
    const d = world.stripe.openDispute(pi);
    await import("@/lib/payments/disputes").then((m) => m.recordDispute(d as never, REQ));
    world.db.insertRow("invoices", {
      org_id: b.org_id,
      booking_id: null,
      stripe_invoice_id: "in_late",
      status: "open",
      amount_due_cents: 5000,
      amount_paid_cents: 0,
      due_at: new Date(Date.now() - 86_400_000).toISOString(),
      currency: "AUD",
      kind: "net_terms",
    });
    const r = await runStripeReconciliation(REQ);
    expect(r.summary.disputesCents).toBe(297_000);
    expect(r.summary.overdueInvoices).toBe(1);
    expect(r.summary.overdueInvoicesCents).toBe(5000);
    expect(r.exceptions.some((e) => e.kind === "dispute_open")).toBe(true);
  });
});

describe("§17.3 — Hostaway webhook receiver", () => {
  const e = () => process.env;
  const url = () => `http://localhost/api/webhooks/hostaway/${e().HOSTAWAY_WEBHOOK_PATH_SECRET}`;
  const auth = () =>
    "Basic " + Buffer.from(`${e().HOSTAWAY_WEBHOOK_USER}:${e().HOSTAWAY_WEBHOOK_PASSWORD}`).toString("base64");
  const post = (body: string, headers: Record<string, string> = {}, u = url()) =>
    hostawayWebhook(
      new Request(u, {
        method: "POST",
        body,
        headers: { authorization: auth(), "content-type": "application/json", ...headers },
      }),
      {
        params: Promise.resolve({ secret: u.split("/").pop()! }),
      } as never,
    );

  it("replayed: the duplicate is recorded and skipped; spoofed: wrong auth or path secret is rejected", async () => {
    const body = JSON.stringify({
      event: "reservation.updated",
      reservationId: 5001,
      data: { id: 5001, status: "cancelled" },
    });
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(200);
    expect(world.db.rows("webhook_events")).toHaveLength(1);
    expect((await post(body, { authorization: "Basic bm90OnJpZ2h0" })).status).toBe(401);
    expect((await post(body, {}, "http://localhost/api/webhooks/hostaway/not-the-secret")).status).toBe(401);
    expect(world.db.rows("webhook_events")).toHaveLength(1);
    // Contents are never trusted: the stored row is a hint; nothing on the booking changed.
    expect(world.db.rows("booking_requests")).toHaveLength(0);
  });

  it("unknown event type: logged, acknowledged with 200, kept for review — no retry storm", async () => {
    expect((await post(JSON.stringify({ event: "something.new", data: { id: 1 } }))).status).toBe(200);
    expect((await post("not json at all")).status).toBe(200);
    const rows = world.db.rows<{ event_type: string; state: string }>("webhook_events");
    expect(rows.map((r) => r.event_type).sort()).toEqual(["something.new", "unparseable"]);
    expect(rows.every((r) => r.state === "received")).toBe(true);
  });
});
