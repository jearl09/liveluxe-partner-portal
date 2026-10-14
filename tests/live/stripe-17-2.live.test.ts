/**
 * §17.2 against REAL Stripe test mode (and the real Hostaway TEST account for the
 * reservation steps). Run with `npm run verify:live -- stripe`. Rows that cannot be
 * reproduced in test mode are marked skip with the reason; they are covered by
 * tests/integration/payments-17-2.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/admin", () => import("./harness").then((m) => m.factories.admin()));
vi.mock("@/lib/db/server", () => import("./harness").then((m) => m.factories.server()));
vi.mock("@/lib/notifications/email", () => import("./harness").then((m) => m.factories.email()));
vi.mock("@/lib/notifications/slack", () => import("./harness").then((m) => m.factories.slack()));

import { checkAuthorisations } from "@/lib/jobs/check-authorisations";
import { processWebhookEvent } from "@/lib/jobs/drain-webhooks";
import { confirmBooking } from "@/lib/payments/confirm";
import { recordDispute } from "@/lib/payments/disputes";
import { runDunning } from "@/lib/payments/dunning";
import { ensurePaymentIntent, latestPayment, syncPaymentIntent } from "@/lib/payments/intents";
import { cancelBooking } from "@/lib/requests/cancel";
import { approve } from "@/lib/requests/decide";
import { approveEarlyDeparture, requestEarlyDeparture } from "@/lib/requests/modifications";
import { creditDecisionForSubmission } from "@/lib/requests/submit";
import { getStripe } from "@/lib/stripe/client";
import { processStripeEvent } from "@/lib/stripe/webhooks";
import {
  asUser,
  booking,
  cleanup,
  criticalContaining,
  emailsOfType,
  live,
  seedBooking,
  seedFixture,
  type Fixture,
} from "./harness";

const REQ = "verify-live";
let f: Fixture;

/** The partner's Payment Element step, done server-side with a Stripe test payment method. */
async function hold(bookingId: string, paymentMethod = "pm_card_visa") {
  const view = await ensurePaymentIntent(await booking(bookingId), `booker@example.com`);
  const pi = await getStripe()
    .paymentIntents.confirm(view.paymentIntentId, {
      payment_method: paymentMethod,
      return_url: "https://example.com/return",
    })
    .catch((e) => e);
  await syncPaymentIntent(view.paymentIntentId);
  return { paymentIntentId: view.paymentIntentId, pi };
}

async function event(type: string, object: unknown) {
  const ev = {
    id: `evt_${crypto.randomUUID()}`,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
  } as never;
  return processStripeEvent(ev, REQ);
}

beforeAll(async () => {
  f = await seedFixture();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(() => live.resetCaptured());

describe("happy path — mode A end to end", () => {
  it("hold → approve (live re-check) → reservation in the Hostaway test account → capture → CONFIRMED → receipt", async () => {
    const b = await seedBooking(f);
    const { pi } = await hold(b.id);
    expect(pi.status).toBe("requires_capture");
    await approve(asUser(f, "ops")!, b.id, REQ);
    asUser(f, null);
    const out = await confirmBooking(b.id, REQ, "approval");
    expect(out.status).toBe("CONFIRMED");
    const after = await booking(b.id);
    expect(after.hostaway_reservation_id).toBeTypeOf("number");
    live.created.reservations.push(after.hostaway_reservation_id!);
    const pay = (await latestPayment(b.id))!;
    expect(pay.status).toBe("succeeded");
    expect(pay.amount_captured_cents).toBe(b.total_cents);
    const { data: inv } = await live.db.from("invoices").select("kind, status, number").eq("booking_id", b.id);
    expect(inv?.[0]).toMatchObject({ kind: "receipt", status: "paid" });
    expect(inv?.[0]?.number).toBeTruthy();
    expect(emailsOfType("booking_confirmed")).toHaveLength(1);
  });
});

describe("§17.2 row 1 — card authorisation fails", () => {
  it("pm_card_chargeDeclined: failure recorded, partner emailed in plain language, approval gated", async () => {
    const b = await seedBooking(f, { daysToCheckIn: 40 });
    const { paymentIntentId } = await hold(b.id, "pm_card_chargeDeclined");
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
    await event("payment_intent.payment_failed", pi);
    expect((await latestPayment(b.id))!.failure_code).toBeTruthy();
    expect(emailsOfType("card_declined")).toHaveLength(1);
    await expect(approve(asUser(f, "ops")!, b.id, REQ)).rejects.toMatchObject({ code: "PAYMENT_NOT_AUTHORISED" });
    asUser(f, null);
  });
});

describe("§17.2 row 2 — 3DS challenge abandoned", () => {
  it("pm_card_authenticationRequired leaves requires_action; one resume email after the window", async () => {
    const b = await seedBooking(f, { daysToCheckIn: 50 });
    const { paymentIntentId } = await hold(b.id, "pm_card_authenticationRequired");
    expect((await latestPayment(b.id))!.status).toBe("requires_action");
    await live.db
      .from("payments")
      .update({ updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString() })
      .eq("stripe_payment_intent_id", paymentIntentId);
    await checkAuthorisations({ requestId: REQ });
    expect(emailsOfType("resume_payment")).toHaveLength(1);
    await checkAuthorisations({ requestId: REQ });
    expect(emailsOfType("resume_payment")).toHaveLength(1);
  });
});

describe("§17.2 row 3 — authorisation expires before approval", () => {
  it.skip("not reproducible in test mode: Stripe only releases an authorisation after ~7 days and the API cannot set cancellation_reason=automatic. Covered in-process.", () => {});
  it("the daily job flags a hold older than 5 days", async () => {
    const b = await seedBooking(f, { daysToCheckIn: 60 });
    await hold(b.id);
    await live.db
      .from("payments")
      .update({ authorised_at: new Date(Date.now() - 6 * 86_400_000).toISOString() })
      .eq("booking_id", b.id);
    const r = await checkAuthorisations({ requestId: REQ });
    expect(r.notes).toContain("stale=1");
  });
});

describe("§17.2 row 4 — capture fails after the Hostaway reservation was created", () => {
  it.skip("not reproducible in test mode: no Stripe test card declines at capture time (declines happen at confirmation). Covered in-process with an injected capture failure.", () => {});
});

describe("§17.2 row 5 — partial refund (early departure)", () => {
  it("policy amount refunded through a real Stripe refund; booking shortened; Hostaway reservation updated", async () => {
    const b = await seedBooking(f, { daysToCheckIn: 70, nights: 4 });
    await hold(b.id);
    await approve(asUser(f, "ops")!, b.id, REQ);
    asUser(f, null);
    expect((await confirmBooking(b.id, REQ, "approval")).status).toBe("CONFIRMED");
    const confirmed = await booking(b.id);
    live.created.reservations.push(confirmed.hostaway_reservation_id!);
    const newCheckOut = new Date(Date.parse(`${confirmed.check_out}T00:00:00Z`) - 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { quote } = await requestEarlyDeparture(asUser(f, "booker")!, b.id, { newCheckOut, reason: "verify" }, REQ);
    const { data: mods } = await live.db.from("booking_modifications").select("id").eq("booking_id", b.id);
    const done = await approveEarlyDeparture(
      asUser(f, "ops")!,
      mods![0].id,
      { overrideRefundCents: null, note: "" },
      REQ,
    );
    asUser(f, null);
    expect(done.status).toBe("approved");
    const { data: refunds } = await live.db
      .from("refunds")
      .select("amount_cents, status, stripe_refund_id")
      .eq("booking_id", b.id);
    expect(refunds?.[0]?.amount_cents).toBe(quote.refundCents);
    const stripeRefund = await getStripe().refunds.retrieve(refunds![0].stripe_refund_id);
    expect(stripeRefund.amount).toBe(quote.refundCents);
    expect((await booking(b.id)).check_out).toBe(newCheckOut);
  });
});

describe("§17.2 row 6 — chargeback raised", () => {
  it("pm_card_createDispute: dispute mirrored with an evidence pack, refunds frozen, finance alerted", async () => {
    const b = await seedBooking(f, { daysToCheckIn: 80 });
    const { paymentIntentId } = await hold(b.id, "pm_card_createDispute");
    await approve(asUser(f, "ops")!, b.id, REQ);
    asUser(f, null);
    expect((await confirmBooking(b.id, REQ, "approval")).status).toBe("CONFIRMED");
    live.created.reservations.push((await booking(b.id)).hostaway_reservation_id!);
    // Stripe raises the dispute on capture; fetch it rather than waiting for the webhook.
    let dispute = null as null | { id: string };
    for (let i = 0; i < 20 && !dispute; i++) {
      const list = await getStripe().disputes.list({ payment_intent: paymentIntentId, limit: 1 });
      dispute = list.data[0] ?? null;
      if (!dispute) await new Promise((r) => setTimeout(r, 1500));
    }
    expect(dispute).toBeTruthy();
    await recordDispute(await getStripe().disputes.retrieve(dispute!.id), REQ);
    expect(criticalContaining("dispute opened")).toHaveLength(1);
    expect((await booking(b.id)).refunds_frozen_at).toBeTruthy();
    await expect(cancelBooking(asUser(f, "finance")!, b.id, { reason: "other", note: "" }, REQ)).rejects.toMatchObject({
      code: "REFUNDS_FROZEN",
    });
    asUser(f, null);
  });
});

describe("§17.2 row 7 — duplicate submission", () => {
  it.skip("needs the live pricing path (calendar + rate cards) against a synced listing; covered in-process against the submit RPC semantics. Exercise manually: double-click Submit on /requests/new and confirm one request + one hold.", () => {});
});

describe("§17.2 row 8 — webhook arrives before the local record", () => {
  it("a real PaymentIntent for a booking id that does not exist yet is parked, then processed once the row exists", async () => {
    const ghost = crypto.randomUUID();
    const pi = await getStripe().paymentIntents.create({
      amount: 1000,
      currency: "aud",
      capture_method: "manual",
      payment_method: "pm_card_visa",
      confirm: true,
      return_url: "https://example.com/r",
      metadata: { booking_id: ghost },
    });
    const ev = {
      id: `evt_${crypto.randomUUID()}`,
      type: "payment_intent.amount_capturable_updated",
      data: { object: pi },
    };
    const { data: row } = await live.db
      .from("webhook_events")
      .insert({ source: "stripe", event_type: ev.type, external_id: ev.id, payload: ev as never })
      .select("id")
      .single();
    expect(await processWebhookEvent(row!.id, REQ)).toBe("parked");
    await seedBooking(f, { id: ghost, daysToCheckIn: 90, total_cents: 1000 });
    await live.db
      .from("webhook_events")
      .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", row!.id);
    expect(await processWebhookEvent(row!.id, REQ)).toBe("processed");
    expect((await latestPayment(ghost))!.status).toBe("requires_capture");
    await live.db.from("webhook_events").delete().eq("id", row!.id);
  });
});

describe("§17.2 row 9 — Stripe outage", () => {
  it.skip("cannot be induced against Stripe; covered in-process (StripeConnectionError → PAYMENT_PROVIDER_UNAVAILABLE, never-started reminder).", () => {});
});

describe("§17.2 row 10 — partner exceeds credit limit", () => {
  it("blocked or routed to finance per configuration (database only)", async () => {
    await live.db
      .from("partner_orgs")
      .update({ payment_terms: "net30", credit_limit_cents: 100_000 })
      .eq("id", f.orgId);
    const { data: inv } = await live.db
      .from("invoices")
      .insert({
        org_id: f.orgId,
        stripe_invoice_id: `in_verify_${Date.now()}`,
        status: "open",
        amount_due_cents: 90_000,
        amount_paid_cents: 0,
        currency: "AUD",
        kind: "net_terms",
      })
      .select("id")
      .single();
    expect((await creditDecisionForSubmission(f.orgId, 50_000)).outcome).toBe("block");
    await live.db.from("invoices").delete().eq("id", inv!.id);
    await live.db.from("partner_orgs").update({ payment_terms: "prepay", credit_limit_cents: null }).eq("id", f.orgId);
  });
});

describe("§17.2 row 11 — invoice unpaid past terms", () => {
  it("reminders and credit standing move with the days overdue (database + captured email)", async () => {
    const { data: inv } = await live.db
      .from("invoices")
      .insert({
        org_id: f.orgId,
        stripe_invoice_id: `in_verify_dun_${Date.now()}`,
        number: "VERIFY-1",
        status: "open",
        amount_due_cents: 10_000,
        amount_paid_cents: 0,
        currency: "AUD",
        kind: "net_terms",
        due_at: new Date(Date.now() - 15 * 86_400_000).toISOString(),
        hosted_url: "https://example.com/i",
      })
      .select("id")
      .single();
    await runDunning(REQ);
    expect(emailsOfType("invoice_reminder")).toHaveLength(1);
    const { data: org } = await live.db.from("partner_orgs").select("credit_standing").eq("id", f.orgId).single();
    expect(org!.credit_standing).toBe("finance_approval");
    await live.db.from("invoices").delete().eq("id", inv!.id);
    await runDunning(REQ);
    const { data: org2 } = await live.db
      .from("partner_orgs")
      .select("credit_standing, status")
      .eq("id", f.orgId)
      .single();
    expect(org2).toMatchObject({ credit_standing: "good", status: "active" });
  });
});

describe("§17.2 row 12 — refund exceeds captured amount", () => {
  it("rejected before Stripe with the maximum; the maximum itself refunds", async () => {
    const b = await seedBooking(f, { daysToCheckIn: 100 });
    await hold(b.id);
    await approve(asUser(f, "ops")!, b.id, REQ);
    asUser(f, null);
    expect((await confirmBooking(b.id, REQ, "approval")).status).toBe("CONFIRMED");
    live.created.reservations.push((await booking(b.id)).hostaway_reservation_id!);
    await expect(
      cancelBooking(
        asUser(f, "finance")!,
        b.id,
        { reason: "other", note: "", overrideRefundCents: b.total_cents! + 1 },
        REQ,
      ),
    ).rejects.toMatchObject({ code: "REFUND_EXCEEDS_CAPTURED" });
    const out = await cancelBooking(
      asUser(f, "finance")!,
      b.id,
      { reason: "other", note: "", overrideRefundCents: b.total_cents! },
      REQ,
    );
    asUser(f, null);
    expect(out.refundOk).toBe(true);
    expect(out.hostaway).toBe("cancelled");
  });
});
