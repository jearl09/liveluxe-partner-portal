/**
 * Spec §17.2 — every payments scenario, exercised against the real orchestration
 * code (confirm, webhooks, jobs, refunds, cancellation, submission) with in-process
 * fakes for Postgres, Stripe and Hostaway. One `describe` per spec row, in the
 * spec's order, plus the happy paths and the idempotency guarantees they rest on.
 *
 * The live Stripe test-mode pass is scripts/verify-stripe-17-2.mjs.
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
vi.mock("@/lib/listings/price", () => ({
  priceStay: async (_listingId: string, stay: { checkIn: string; checkOut: string }) => {
    const { QUOTE_LINES, TOTAL_CENTS, IDS } = await import("./fakes/world");
    return {
      detail: {
        listing: {
          id: IDS.listing,
          public_name: "Southbank Riverside 2BR",
          currency: "AUD",
          security_deposit_cents: 0,
        },
      },
      days: [],
      availability: { available: true, nights: 10, missingDates: [], unavailableDates: [], unpricedDates: [] },
      quote: {
        lines: QUOTE_LINES,
        subtotalCents: 270_000,
        taxCents: 27_000,
        totalCents: TOTAL_CENTS,
        nightlyAverageCents: 25_000,
        nights: 10,
        securityDepositCents: 0,
        rateCardId: null,
        rateCardVersion: null,
        priceHash: `hash-${stay.checkIn}-${stay.checkOut}`,
      },
    };
  },
}));

import type { PaymentRow } from "@/lib/db/types";
import { DomainError } from "@/lib/domain/errors";
import { checkAuthorisations, sendNeverStartedReminders, sendResumeReminders } from "@/lib/jobs/check-authorisations";
import { drainWebhooks, processWebhookEvent } from "@/lib/jobs/drain-webhooks";
import { expireHolds } from "@/lib/jobs/expire-holds";
import { releaseUnpaidInvoices } from "@/lib/jobs/release-unpaid-invoices";
import { confirmBooking } from "@/lib/payments/confirm";
import { applyCreditStanding, loadDunningPolicy, runDunning } from "@/lib/payments/dunning";
import { ensurePaymentIntent, latestPayment } from "@/lib/payments/intents";
import { cancelBooking } from "@/lib/requests/cancel";
import { approve } from "@/lib/requests/decide";
import { approveEarlyDeparture, quoteEarlyDeparture, requestEarlyDeparture } from "@/lib/requests/modifications";
import { creditDecisionForSubmission, submitRequest } from "@/lib/requests/submit";
import { processStripeEvent } from "@/lib/stripe/webhooks";
import {
  asUser,
  booking,
  claimsFor,
  criticalContaining,
  emailsOfType,
  enableHostawayTestWrites,
  IDS,
  placeHold,
  seedBooking,
  seedWorld,
  slackContaining,
  TOTAL_CENTS,
  world,
} from "./fakes/world";

const REQ = "req-test";
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function deliver(type: string, object: Record<string, unknown>) {
  const event = world.stripe.event(type, object);
  const { data: row } = await world.db
    .from("webhook_events")
    .insert({ source: "stripe", event_type: type, external_id: event.id, payload: event as never })
    .select("id")
    .single();
  return { event, outcome: await processWebhookEvent((row as { id: string }).id, REQ) };
}

/** Approve as ops and run the confirmation step as the approve route does. */
async function approveAndConfirm(bookingId: string) {
  await approve(claimsFor("ops"), bookingId, REQ);
  asUser(null);
  return confirmBooking(bookingId, REQ, "approval");
}

beforeEach(async () => {
  world.reset();
  seedWorld();
  await enableHostawayTestWrites(true);
});

describe("happy paths the §17.2 rows rest on", () => {
  it("mode A: hold → approve → Hostaway reservation → capture → CONFIRMED → receipt invoice → email", async () => {
    const b = seedBooking();
    await placeHold(b.id);
    const out = await approveAndConfirm(b.id);
    expect(out.status).toBe("CONFIRMED");
    const after = booking(b.id);
    expect(after.hostaway_reservation_id).toBeTypeOf("number");
    expect(after.hostaway_written_at).toBeTruthy();
    // Order: the reservation was written before the capture (§10.2 steps 15 → 17).
    const created = world.timeline.indexOf("hostaway:createReservation");
    const captured = world.timeline.indexOf("stripe:paymentIntents.capture");
    expect(created).toBeGreaterThanOrEqual(0);
    expect(captured).toBeGreaterThan(created);
    const pay = (await latestPayment(b.id)) as PaymentRow;
    expect(pay.status).toBe("succeeded");
    expect(pay.amount_captured_cents).toBe(TOTAL_CENTS);
    const inv = world.db.rows<{ kind: string; status: string }>("invoices");
    expect(inv).toHaveLength(1);
    expect(inv[0].kind).toBe("receipt");
    expect(inv[0].status).toBe("paid");
    expect(emailsOfType("booking_confirmed")).toHaveLength(1);
    // The reservation carries the platform reference in the configured custom field (§6.7).
    const payload = world.hostaway.calls.find((c) => c.method === "createReservation")!.args[0] as {
      customFieldValues: { value: string }[];
      channelId: number;
    };
    expect(payload.customFieldValues[0].value).toBe(after.reference);
    expect(payload.channelId).toBe(2017);
  });

  it("mode A: a counter-offer accepted after the hold lowered the total → only the new total is captured", async () => {
    const b = seedBooking();
    await placeHold(b.id); // authorised for TOTAL_CENTS
    const lowered = TOTAL_CENTS - 50_000;
    await world.db.from("booking_requests").update({ total_cents: lowered }).eq("id", b.id);
    const out = await approveAndConfirm(b.id);
    expect(out.status).toBe("CONFIRMED");
    const pay = (await latestPayment(b.id)) as PaymentRow;
    expect(pay.status).toBe("succeeded");
    expect(pay.amount_captured_cents).toBe(lowered);
    const capture = world.stripe.calls.find((c) => c.method === "paymentIntents.capture");
    expect((capture?.args[1] as { amount_to_capture?: number })?.amount_to_capture).toBe(lowered);
  });

  it("mode B: captures only the deposit, releases the rest, issues deposit receipt + balance invoice due before check-in", async () => {
    world.reset();
    seedWorld({ paymentTerms: "deposit", depositPct: 25 });
    const b = seedBooking({ daysToCheckIn: 40 });
    await placeHold(b.id);
    const out = await approveAndConfirm(b.id);
    expect(out.status).toBe("CONFIRMED");
    const pay = (await latestPayment(b.id)) as PaymentRow;
    expect(pay.amount_captured_cents).toBe(Math.round(TOTAL_CENTS * 0.25));
    expect(pay.kind).toBe("deposit");
    const after = booking(b.id);
    expect(after.payment_deposit_cents).toBe(Math.round(TOTAL_CENTS * 0.25));
    const invoices = world.db.rows<{ kind: string; status: string; amount_due_cents: number; due_at: string }>(
      "invoices",
    );
    const receipt = invoices.find((i) => i.kind === "receipt")!;
    const balance = invoices.find((i) => i.kind === "balance")!;
    expect(receipt.status).toBe("paid");
    expect(balance.status).toBe("open");
    expect(balance.amount_due_cents).toBe(TOTAL_CENTS - Math.round(TOTAL_CENTS * 0.25));
    expect(balance.due_at.slice(0, 10) < after.check_in).toBe(true);
    expect(after.balance_due_at).toBe(balance.due_at);
    // invoice.paid clears the pre-arrival flag (§11.3).
    const paid = world.stripe.payInvoice(
      world.db.rows<{ stripe_invoice_id: string; kind: string }>("invoices").find((i) => i.kind === "balance")!
        .stripe_invoice_id,
    );
    await processStripeEvent(world.stripe.event("invoice.paid", paid), REQ);
    expect(booking(b.id).balance_paid_at).toBeTruthy();
  });

  it("mode C: no card; net-terms invoice on approval; CONFIRMED; credit limit enforced at approval", async () => {
    world.reset();
    seedWorld({ paymentTerms: "net30", creditLimitCents: 1_000_000 });
    const b = seedBooking();
    const out = await approveAndConfirm(b.id);
    expect(out.status).toBe("CONFIRMED");
    const inv = world.db.rows<{ kind: string; status: string; due_at: string }>("invoices")[0];
    expect(inv.kind).toBe("net_terms");
    expect(inv.status).toBe("open");
    expect(world.stripe.calls.some((c) => c.method === "paymentIntents.create")).toBe(false);
  });

  it("confirmBooking is idempotent: running it three times makes one reservation, one capture, one invoice", async () => {
    const b = seedBooking();
    await placeHold(b.id);
    await approveAndConfirm(b.id);
    await confirmBooking(b.id, REQ, "webhook");
    await confirmBooking(b.id, REQ, "job");
    expect(world.hostaway.calls.filter((c) => c.method === "createReservation")).toHaveLength(1);
    expect(world.stripe.calls.filter((c) => c.method === "paymentIntents.capture")).toHaveLength(1);
    expect(world.db.rows("invoices")).toHaveLength(1);
    expect(world.hostaway.reservations.size).toBe(1);
  });

  it("webhooks delivered twice and out of order change nothing a second time", async () => {
    const b = seedBooking();
    const { paymentIntentId } = await placeHold(b.id);
    await approve(claimsFor("ops"), b.id, REQ);
    asUser(null);
    // succeeded arrives before amount_capturable_updated, and amount_capturable_updated arrives twice.
    const authorised = world.stripe.pi(paymentIntentId);
    const first = await deliver("payment_intent.amount_capturable_updated", authorised);
    expect(first.outcome).toBe("processed");
    expect(booking(b.id).status).toBe("CONFIRMED");
    const captured = world.stripe.pi(paymentIntentId);
    const late = await deliver("payment_intent.succeeded", captured);
    expect(late.outcome).toBe("processed");
    // Replay of the same event id is a duplicate at the persistence layer (unique external_id).
    const { error } = await world.db.from("webhook_events").insert({
      source: "stripe",
      event_type: first.event.type,
      external_id: first.event.id,
      payload: first.event as never,
    });
    expect(error?.code).toBe("23505");
    await deliver("payment_intent.amount_capturable_updated", authorised); // new event id, stale payload
    expect(world.hostaway.calls.filter((c) => c.method === "createReservation")).toHaveLength(1);
    expect(world.stripe.calls.filter((c) => c.method === "paymentIntents.capture")).toHaveLength(1);
    expect(world.db.rows("invoices")).toHaveLength(1);
  });
});

describe("§17.2 row 1 — card authorisation fails", () => {
  it("records the decline, tells the partner in plain language, keeps the hold, and approval stays gated", async () => {
    const b = seedBooking();
    const { paymentIntentId, pi } = await placeHold(b.id, "decline");
    await processStripeEvent(world.stripe.event("payment_intent.payment_failed", pi), REQ);
    const pay = (await latestPayment(b.id)) as PaymentRow;
    expect(pay.failure_code).toBe("card_declined");
    const mail = emailsOfType("card_declined");
    expect(mail).toHaveLength(1);
    expect(mail[0].idempotencyKey).toBe(`card_declined:${paymentIntentId}:card_declined`);
    // Hold retained: still in the holds table and the request stays in review, not in the approvable state.
    expect(world.db.rows<{ booking_id: string }>("inventory_holds").some((h) => h.booking_id === b.id)).toBe(true);
    expect(booking(b.id).status).toBe("UNDER_REVIEW");
    await expect(approve(claimsFor("ops"), b.id, REQ)).rejects.toMatchObject({ code: "PAYMENT_NOT_AUTHORISED" });
    // The same decline delivered again does not email twice.
    await processStripeEvent(world.stripe.event("payment_intent.payment_failed", pi), REQ);
    expect(emailsOfType("card_declined")).toHaveLength(1);
    // Retry with another card: the open intent is reused and the hold lands.
    const again = await ensurePaymentIntent(booking(b.id));
    expect(again.paymentIntentId).toBe(paymentIntentId);
    world.stripe.confirmCard(paymentIntentId, "success");
    await processStripeEvent(
      world.stripe.event("payment_intent.amount_capturable_updated", world.stripe.pi(paymentIntentId)),
      REQ,
    );
    expect((await latestPayment(b.id))!.status).toBe("requires_capture");
  });
});

describe("§17.2 row 2 — 3DS challenge abandoned mid-flow", () => {
  it("emails one resume link after the window, then the sweeper expires the hold and cancels the intent", async () => {
    const b = seedBooking({ hold_expires_at: minutesAgo(-120) });
    const { paymentIntentId } = await placeHold(b.id, "abandon");
    const pay = (await latestPayment(b.id)) as PaymentRow;
    expect(pay.status).toBe("requires_action");
    expect(await sendResumeReminders(REQ, new Date(Date.now() + 30 * 60_000))).toBe(0);
    expect(await sendResumeReminders(REQ, new Date(Date.now() + 61 * 60_000))).toBe(1);
    expect(await sendResumeReminders(REQ, new Date(Date.now() + 120 * 60_000))).toBe(0);
    const mail = emailsOfType("resume_payment");
    expect(mail).toHaveLength(1);
    expect(mail[0].idempotencyKey).toBe(`resume_payment:${paymentIntentId}`);
    // Hold expires normally; the sweeper cancels the PaymentIntent.
    await world.db
      .from("booking_requests")
      .update({ hold_expires_at: minutesAgo(1) })
      .eq("id", b.id);
    const r = await expireHolds({ requestId: REQ });
    expect(r.changed).toBe(1);
    expect(booking(b.id).status).toBe("EXPIRED");
    expect(world.stripe.pi(paymentIntentId).status).toBe("canceled");
    expect(world.db.rows<{ booking_id: string }>("inventory_holds").some((h) => h.booking_id === b.id)).toBe(false);
  });
});

describe("§17.2 row 3 — authorisation expires before approval", () => {
  it("the daily job flags holds older than 5 days to ops", async () => {
    const b = seedBooking();
    await placeHold(b.id);
    await world.db
      .from("payments")
      .update({ authorised_at: daysAgo(6) })
      .eq("booking_id", b.id);
    const r = await checkAuthorisations({ requestId: REQ });
    expect(r.notes).toContain("stale=1");
    expect(slackContaining("older than 5 days")).toHaveLength(1);
  });

  it("if it lapses on an approved booking: AWAITING_PAYMENT, partner asked to re-authorise, never silently confirmed", async () => {
    const b = seedBooking();
    const { paymentIntentId } = await placeHold(b.id);
    await approve(claimsFor("ops"), b.id, REQ);
    asUser(null);
    const expired = world.stripe.expireAuthorisation(paymentIntentId);
    await processStripeEvent(world.stripe.event("payment_intent.canceled", expired), REQ);
    expect(booking(b.id).status).toBe("AWAITING_PAYMENT");
    expect(emailsOfType("hold_released")).toHaveLength(1);
    // A confirmation attempt now does not touch Hostaway and does not confirm.
    const out = await confirmBooking(b.id, REQ, "job");
    expect(out.status).toBe("AWAITING_PAYMENT");
    expect(world.hostaway.calls.filter((c) => c.method === "createReservation")).toHaveLength(0);
    // Partner re-authorises → webhook → reservation → capture → CONFIRMED.
    const again = await placeHold(b.id);
    await processStripeEvent(world.stripe.event("payment_intent.amount_capturable_updated", again.pi), REQ);
    expect(booking(b.id).status).toBe("CONFIRMED");
  });

  it("if it lapses while still under review: partner told, status unchanged, our own voids never email", async () => {
    const b = seedBooking();
    const { paymentIntentId } = await placeHold(b.id);
    await processStripeEvent(
      world.stripe.event("payment_intent.canceled", world.stripe.expireAuthorisation(paymentIntentId)),
      REQ,
    );
    expect(booking(b.id).status).toBe("UNDER_REVIEW");
    expect(emailsOfType("hold_released")).toHaveLength(1);
    // Our own void (decline) produces a canceled event too — that one must stay silent.
    const b2 = seedBooking({ daysToCheckIn: 60 });
    const h2 = await placeHold(b2.id);
    const voided = await world.stripe.paymentIntents.cancel(h2.paymentIntentId, {
      cancellation_reason: "requested_by_customer",
    });
    await processStripeEvent(
      world.stripe.event("payment_intent.canceled", voided as unknown as Record<string, unknown>),
      REQ,
    );
    expect(emailsOfType("hold_released")).toHaveLength(1);
  });
});

describe("§17.2 row 4 — capture fails after the Hostaway reservation was created", () => {
  it("CRITICAL to finance, booking AWAITING_PAYMENT, reservation retained; a later payment reuses it", async () => {
    const b = seedBooking();
    await placeHold(b.id);
    await approve(claimsFor("ops"), b.id, REQ);
    asUser(null);
    world.stripe.failNextCapture = { code: "card_declined", message: "Your card was declined." };
    const out = await confirmBooking(b.id, REQ, "approval");
    expect(out.status).toBe("AWAITING_PAYMENT");
    const after = booking(b.id);
    expect(after.status).toBe("AWAITING_PAYMENT");
    expect(after.hostaway_reservation_id).toBeTypeOf("number");
    expect(world.hostaway.reservations.get(after.hostaway_reservation_id!)?.status).toBe("new"); // never auto-cancelled
    expect(criticalContaining("Capture failed after the Hostaway reservation")).toHaveLength(1);
    expect(emailsOfType("payment_required")).toHaveLength(1);
    // Partner pays again: no second reservation, capture succeeds, CONFIRMED.
    const again = await placeHold(b.id);
    await processStripeEvent(world.stripe.event("payment_intent.amount_capturable_updated", again.pi), REQ);
    expect(booking(b.id).status).toBe("CONFIRMED");
    expect(world.hostaway.calls.filter((c) => c.method === "createReservation")).toHaveLength(1);
    expect(world.hostaway.reservations.size).toBe(1);
  });
});

describe("§17.2 row 5 — partial refund needed (early departure)", () => {
  async function confirmed() {
    const b = seedBooking({ daysToCheckIn: 20, nights: 10 });
    await placeHold(b.id);
    await approveAndConfirm(b.id);
    return booking(b.id);
  }

  it("policy-calculated amount pre-filled, Stripe refund created, Hostaway shortened, partner sees the calculation", async () => {
    const b = await confirmed();
    const newCheckOut = new Date(Date.parse(`${b.check_out}T00:00:00Z`) - 4 * 86_400_000).toISOString().slice(0, 10);
    const { quote } = await requestEarlyDeparture(
      claimsFor("booker"),
      b.id,
      { newCheckOut, reason: "Rebuild finished early" },
      REQ,
    );
    expect(quote.unusedNights).toBe(4);
    expect(quote.refundCents).toBe(Math.round((TOTAL_CENTS / 10) * 4)); // empty retention schedule → full refund of unused nights before cut-off
    const mod = world.db.rows<{ id: string; status: string }>("booking_modifications")[0];
    const done = await approveEarlyDeparture(claimsFor("ops"), mod.id, { overrideRefundCents: null, note: "" }, REQ);
    expect(done.status).toBe("approved");
    const refund = world.db.rows<{ amount_cents: number; status: string; approved_by: string }>("refunds")[0];
    expect(refund.amount_cents).toBe(quote.refundCents);
    expect(refund.status).toBe("succeeded");
    expect(refund.approved_by).toBe(IDS.ops);
    expect(booking(b.id).check_out).toBe(newCheckOut);
    expect(booking(b.id).total_cents).toBe(TOTAL_CENTS - quote.refundCents);
    const upd = world.hostaway.calls.find((c) => c.method === "updateReservation")!;
    expect((upd.args[1] as { departureDate: string }).departureDate).toBe(newCheckOut);
    expect(emailsOfType("modification_decided")).toHaveLength(1);
    // The invoice stays coherent: a credit note was issued against the paid receipt.
    expect(world.stripe.store.creditNotes.size).toBe(1);
  });

  it("finance may override the amount with a mandatory reason; ops may not; over the maximum is rejected before Stripe", async () => {
    const b = await confirmed();
    const newCheckOut = new Date(Date.parse(`${b.check_out}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
    await requestEarlyDeparture(claimsFor("booker"), b.id, { newCheckOut, reason: "" }, REQ);
    const mod = world.db.rows<{ id: string }>("booking_modifications")[0];
    await expect(
      approveEarlyDeparture(claimsFor("ops"), mod.id, { overrideRefundCents: 1000, note: "x" }, REQ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      approveEarlyDeparture(claimsFor("finance"), mod.id, { overrideRefundCents: 1000, note: "" }, REQ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      approveEarlyDeparture(
        claimsFor("finance"),
        mod.id,
        { overrideRefundCents: TOTAL_CENTS + 1, note: "goodwill" },
        REQ,
      ),
    ).rejects.toMatchObject({ code: "REFUND_EXCEEDS_CAPTURED", details: { maxRefundableCents: TOTAL_CENTS } });
    expect(world.stripe.calls.filter((c) => c.method === "refunds.create")).toHaveLength(0);
    const q = await quoteEarlyDeparture(
      (await import("@/lib/requests/load").then((m) => m.getRequest(b.id)))!,
      newCheckOut,
    );
    expect(q.maxRefundableCents).toBe(TOTAL_CENTS);
    const done = await approveEarlyDeparture(
      claimsFor("finance"),
      mod.id,
      { overrideRefundCents: 50_000, note: "goodwill" },
      REQ,
    );
    expect(done.delta_cents).toBe(-50_000);
    expect(world.db.rows<{ amount_cents: number }>("refunds")[0].amount_cents).toBe(50_000);
  });
});

describe("§17.2 row 6 — chargeback raised", () => {
  it("finance alerted, dispute mirrored with an evidence pack, automated refunds frozen until it closes", async () => {
    const b = seedBooking();
    const { paymentIntentId } = await placeHold(b.id);
    await approveAndConfirm(b.id);
    const dispute = world.stripe.openDispute(paymentIntentId);
    await processStripeEvent(world.stripe.event("charge.dispute.created", dispute), REQ);
    expect(criticalContaining("dispute opened")).toHaveLength(1);
    const row = world.db.rows<{
      booking_id: string;
      status: string;
      evidence: Record<string, unknown> | null;
      evidence_built_at: string;
    }>("disputes")[0];
    expect(row.booking_id).toBe(b.id);
    expect(row.evidence_built_at).toBeTruthy();
    expect(Array.isArray(row.evidence?.approvalTrail)).toBe(true);
    expect((row.evidence?.approvalTrail as unknown[]).length).toBeGreaterThan(0);
    expect(booking(b.id).refunds_frozen_at).toBeTruthy();
    // A cancellation that would refund is refused while frozen; nothing reaches Stripe.
    await expect(cancelBooking(claimsFor("finance"), b.id, { reason: "other", note: "" }, REQ)).rejects.toMatchObject({
      code: "REFUNDS_FROZEN",
    });
    expect(world.stripe.calls.filter((c) => c.method === "refunds.create")).toHaveLength(0);
    expect(booking(b.id).status).toBe("CONFIRMED");
    // Closed → freeze lifted.
    await processStripeEvent(
      world.stripe.event("charge.dispute.closed", world.stripe.closeDispute(dispute.id as string, "won")),
      REQ,
    );
    expect(booking(b.id).refunds_frozen_at).toBeNull();
    expect(world.db.rows<{ status: string }>("disputes")[0].status).toBe("won");
  });
});

describe("§17.2 row 7 — duplicate submission (double-click, browser retry)", () => {
  it("the second call returns the first result: one request, one hold, one PaymentIntent", async () => {
    const claims = claimsFor("booker");
    const input = {
      listingId: IDS.listing,
      stay: { checkIn: "2027-03-01", checkOut: "2027-03-08", adults: 2, children: 0, pets: 0 },
      priceHash: null,
      form: { guestName: "Rebecca Whitfield", guestEmail: "r@example.com", acceptTerms: "on" },
      submissionKey: "9d5c2e52-5e8a-4f0f-9ed7-1b5d6d9a0c11",
    };
    const first = await submitRequest(claims, input, REQ);
    const second = await submitRequest(claims, input, REQ);
    expect(second.id).toBe(first.id);
    expect(second.duplicate).toBe(true);
    expect(world.db.rows("booking_requests")).toHaveLength(1);
    expect(world.db.rows("inventory_holds")).toHaveLength(1);
    await ensurePaymentIntent(booking(first.id));
    await ensurePaymentIntent(booking(first.id));
    expect(world.stripe.pis.size).toBe(1);
    // A different key for the same dates is the §17.1 "just taken" case, not a duplicate.
    await expect(
      submitRequest(claims, { ...input, submissionKey: "7a0a9f2a-2d7e-4c37-8d0d-7d3f2a3b4c5d" }, REQ),
    ).rejects.toMatchObject({ code: "DATES_HELD" });
  });
});

describe("§17.2 row 8 — Stripe webhook arrives before the local record is committed", () => {
  it("parks the event and retries with backoff; processes once the booking exists; alerts after 15 minutes", async () => {
    const ghost = "99999999-9999-4999-8999-999999999999";
    const pi = await world.stripe.paymentIntents.create({
      amount: 1000,
      currency: "aud",
      capture_method: "manual",
      metadata: { booking_id: ghost },
    });
    const piId = pi.id as string;
    world.stripe.confirmCard(piId);
    const { outcome } = await deliver("payment_intent.amount_capturable_updated", world.stripe.pi(piId));
    expect(outcome).toBe("parked");
    const parked = world.db.rows<{ state: string; attempts: number; next_attempt_at: string; parked_reason: string }>(
      "webhook_events",
    )[0];
    expect(parked.state).toBe("received");
    expect(parked.attempts).toBe(1);
    expect(parked.parked_reason).toContain(ghost);
    expect(Date.parse(parked.next_attempt_at)).toBeGreaterThan(Date.now() + 50_000);
    // Not yet due: the drain leaves it alone.
    expect((await drainWebhooks({ requestId: REQ })).notes).toContain("processed=0");
    // The record lands; once due, the drain processes it.
    seedBooking({ id: ghost, total_cents: 1000 });
    await world.db
      .from("webhook_events")
      .update({ next_attempt_at: minutesAgo(1) })
      .eq("id", world.db.rows<{ id: string }>("webhook_events")[0].id);
    const r = await drainWebhooks({ requestId: REQ });
    expect(r.notes).toContain("processed=1");
    expect(world.db.rows<{ state: string }>("webhook_events")[0].state).toBe("processed");
    expect((await latestPayment(ghost))!.status).toBe("requires_capture");
    // An event that never matches: after 15 minutes it fails with an alert instead of retrying forever.
    const pi2 = await world.stripe.paymentIntents.create({
      amount: 1000,
      currency: "aud",
      capture_method: "manual",
      metadata: { booking_id: "88888888-8888-4888-8888-888888888888" },
    });
    const pi2Id = pi2.id as string;
    world.stripe.confirmCard(pi2Id);
    const ev = world.stripe.event("payment_intent.amount_capturable_updated", world.stripe.pi(pi2Id));
    const { data: row } = await world.db
      .from("webhook_events")
      .insert({
        source: "stripe",
        event_type: ev.type,
        external_id: ev.id,
        payload: ev as never,
        received_at: minutesAgo(16),
      })
      .select("id")
      .single();
    expect(await processWebhookEvent((row as { id: string }).id, REQ)).toBe("failed");
    expect(criticalContaining("never matched a local record")).toHaveLength(1);
  });
});

describe("§17.2 row 9 — Stripe outage", () => {
  it("the request is held, the pay step says so, and the partner is emailed to complete payment when nothing started", async () => {
    const b = seedBooking({ status: "SUBMITTED", submitted_at: minutesAgo(90) });
    world.stripe.outage = true;
    await expect(ensurePaymentIntent(booking(b.id))).rejects.toMatchObject({ code: "PAYMENT_PROVIDER_UNAVAILABLE" });
    expect(booking(b.id).status).toBe("SUBMITTED");
    expect(world.db.rows<{ booking_id: string }>("inventory_holds").some((h) => h.booking_id === b.id)).toBe(true);
    world.stripe.outage = false;
    expect(await sendNeverStartedReminders(REQ)).toBe(1);
    expect(await sendNeverStartedReminders(REQ)).toBe(0); // once only
    expect(emailsOfType("resume_payment")).toHaveLength(1);
    // Service back: the same booking can now place its hold normally.
    const h = await placeHold(b.id);
    expect(h.pi.status).toBe("requires_capture");
  });
});

describe("§17.2 row 10 — partner exceeds credit limit", () => {
  it("blocked at submission with the finance contact named, or routed to finance approval per configuration", async () => {
    world.reset();
    seedWorld({ paymentTerms: "net30", creditLimitCents: 500_000 });
    // An open invoice already consumes most of the limit.
    world.db.insertRow("invoices", {
      org_id: IDS.org,
      booking_id: null,
      stripe_invoice_id: "in_open1",
      status: "open",
      amount_due_cents: 400_000,
      amount_paid_cents: 0,
      currency: "AUD",
      kind: "net_terms",
    });
    const blocked = await creditDecisionForSubmission(IDS.org, TOTAL_CENTS);
    expect(blocked.outcome).toBe("block");
    await expect(
      submitRequest(
        claimsFor("booker"),
        {
          listingId: IDS.listing,
          stay: { checkIn: "2027-04-01", checkOut: "2027-04-11", adults: 2, children: 0, pets: 0 },
          priceHash: null,
          form: { guestName: "Guest", guestEmail: "g@x.test", acceptTerms: "on" },
        },
        REQ,
      ),
    ).rejects.toMatchObject({
      code: "CREDIT_LIMIT_EXCEEDED",
      details: { detail: expect.stringContaining("finance@liveluxe.test") },
    });
    expect(world.db.rows("booking_requests")).toHaveLength(0);

    await world.db.from("settings").update({ value: "finance_approval" }).eq("key", "credit.over_limit_action");
    const routed = await submitRequest(
      claimsFor("booker"),
      {
        listingId: IDS.listing,
        stay: { checkIn: "2027-04-01", checkOut: "2027-04-11", adults: 2, children: 0, pets: 0 },
        priceHash: null,
        form: { guestName: "Guest", guestEmail: "g@x.test", acceptTerms: "on" },
      },
      REQ,
    );
    expect(routed.financeApproval).toBe(true);
    expect(booking(routed.id).finance_approval_required).toBe(true);
    expect(slackContaining("finance approval")).toHaveLength(1);
    // Ops cannot approve a finance-routed request; finance can (and the limit is still checked at approval).
    await expect(approve(claimsFor("ops"), routed.id, REQ)).rejects.toMatchObject({
      code: "FINANCE_APPROVAL_REQUIRED",
    });
    await expect(approve(claimsFor("finance"), routed.id, REQ)).rejects.toMatchObject({
      code: "CREDIT_LIMIT_EXCEEDED",
    });
    await world.db.from("partner_orgs").update({ credit_limit_cents: 2_000_000 }).eq("id", IDS.org);
    const approved = await approve(claimsFor("finance"), routed.id, REQ);
    expect(approved.status).toBe("APPROVED");
  });

  it("ops value ceiling is enforced server-side (§10.5)", async () => {
    await world.db.from("settings").update({ value: 100_000 }).eq("key", "approval.ops_value_ceiling_cents");
    const b = seedBooking();
    await placeHold(b.id);
    await expect(approve(claimsFor("ops"), b.id, REQ)).rejects.toMatchObject({ code: "APPROVAL_VALUE_CEILING" });
    expect((await approve(claimsFor("finance"), b.id, REQ)).status).toBe("APPROVED");
  });
});

describe("§17.2 row 11 — invoice unpaid past terms (dunning)", () => {
  function openInvoice(daysOverdue: number, id = "in_dun1") {
    world.db.insertRow("invoices", {
      org_id: IDS.org,
      booking_id: null,
      stripe_invoice_id: id,
      number: "LL-0007",
      status: "open",
      amount_due_cents: 250_000,
      amount_paid_cents: 0,
      currency: "AUD",
      kind: "net_terms",
      due_at: daysAgo(daysOverdue),
      hosted_url: "https://invoice.stripe.test/in_dun1",
    });
  }

  it("escalating reminders → finance approval → suspension (existing bookings untouched) → recovery on payment", async () => {
    const live = seedBooking({ status: "CONFIRMED" });
    openInvoice(2);
    let r = await runDunning(REQ);
    expect(r.notes).toContain("reminders=1");
    expect(emailsOfType("invoice_reminder")).toHaveLength(1);
    expect(emailsOfType("invoice_reminder")[0].to).toEqual(["ap@acme.test"]); // billing contact first
    expect(world.db.rows<{ credit_standing: string }>("partner_orgs")[0].credit_standing).toBe("watch");
    // Rerun the same day: nothing new.
    r = await runDunning(REQ);
    expect(r.notes).toContain("reminders=0");
    // Day 8: second rung, admins copied, the email warns of the restrictions ahead.
    await world.db
      .from("invoices")
      .update({ due_at: daysAgo(8) })
      .eq("stripe_invoice_id", "in_dun1");
    r = await runDunning(REQ);
    expect(emailsOfType("invoice_reminder")).toHaveLength(2);
    expect(emailsOfType("invoice_reminder")[1].to).toEqual(expect.arrayContaining(["ap@acme.test", "admin@acme.test"]));
    // Day 15: finance approval threshold.
    await world.db
      .from("invoices")
      .update({ due_at: daysAgo(15) })
      .eq("stripe_invoice_id", "in_dun1");
    await runDunning(REQ);
    expect(world.db.rows<{ credit_standing: string }>("partner_orgs")[0].credit_standing).toBe("finance_approval");
    expect(slackContaining("finance approval")).toHaveLength(1);
    const decision = await creditDecisionForSubmission(IDS.org, 1000);
    expect(decision.outcome).toBe("finance_approval");
    // Day 31: suspended for new bookings; the confirmed booking is untouched.
    await world.db
      .from("invoices")
      .update({ due_at: daysAgo(31) })
      .eq("stripe_invoice_id", "in_dun1");
    await runDunning(REQ);
    const org = world.db.rows<{ credit_standing: string; status: string }>("partner_orgs")[0];
    expect(org.credit_standing).toBe("suspended");
    expect(org.status).toBe("suspended");
    expect(booking(live.id).status).toBe("CONFIRMED");
    expect((await creditDecisionForSubmission(IDS.org, 1000)).outcome).toBe("block");
    // Paid: standing restored, org active again.
    await world.db
      .from("invoices")
      .update({ status: "paid", amount_paid_cents: 250_000 })
      .eq("stripe_invoice_id", "in_dun1");
    const after = await applyCreditStanding(IDS.org, await loadDunningPolicy(), new Date(), REQ);
    expect(after.standing).toBe("good");
    expect(world.db.rows<{ status: string }>("partner_orgs")[0].status).toBe("active");
  });

  it("invoice.payment_failed escalates to finance after N attempts and flags the org", async () => {
    const inv = await world.stripe.invoices.create({
      customer: "cus_x",
      collection_method: "send_invoice",
      days_until_due: 14,
      currency: "aud",
      metadata: { org_id: IDS.org, kind: "net_terms" },
    });
    await world.stripe.invoiceItems.create({
      customer: "cus_x",
      invoice: inv.id as string,
      amount: 1000,
      currency: "aud",
    });
    await world.stripe.invoices.finalizeInvoice(inv.id as string);
    await processStripeEvent(
      world.stripe.event("invoice.payment_failed", world.stripe.failInvoicePayment(inv.id as string)),
      REQ,
    );
    expect(world.db.rows<{ credit_standing: string }>("partner_orgs")[0].credit_standing).toBe("watch");
    expect(world.captured.slack.at(-1)?.channel).toBe("bookings");
    await processStripeEvent(
      world.stripe.event("invoice.payment_failed", world.stripe.failInvoicePayment(inv.id as string)),
      REQ,
    );
    expect(world.captured.slack.at(-1)?.channel).toBe("alerts");
    expect(world.db.rows<{ attempt_count: number }>("invoices")[0].attempt_count).toBe(2);
  });
});

describe("§17.2 row 12 — refund exceeds captured amount", () => {
  it("rejected before reaching Stripe with the maximum refundable amount", async () => {
    const b = seedBooking();
    await placeHold(b.id);
    await approveAndConfirm(b.id);
    await expect(
      cancelBooking(
        claimsFor("finance"),
        b.id,
        { reason: "other", note: "", overrideRefundCents: TOTAL_CENTS + 100 },
        REQ,
      ),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DomainError &&
        e.code === "REFUND_EXCEEDS_CAPTURED" &&
        e.details?.maxRefundableCents === TOTAL_CENTS,
    );
    expect(world.stripe.calls.filter((c) => c.method === "refunds.create")).toHaveLength(0);
    expect(booking(b.id).status).toBe("CONFIRMED");
    // At the maximum it goes through.
    const out = await cancelBooking(
      claimsFor("finance"),
      b.id,
      { reason: "other", note: "", overrideRefundCents: TOTAL_CENTS },
      REQ,
    );
    expect(out.refundOk).toBe(true);
    expect(out.refundCents).toBe(TOTAL_CENTS);
  });
});

describe("unpaid net-terms invoice releases the booking (David, 20 Oct 2026)", () => {
  const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

  async function confirmedOnAccount() {
    world.reset();
    seedWorld({ paymentTerms: "net30", creditLimitCents: 1_000_000 });
    await enableHostawayTestWrites(true);
    const b = seedBooking({ daysToCheckIn: 20 });
    const out = await approveAndConfirm(b.id);
    expect(out.status).toBe("CONFIRMED");
    const inv = world.db.rows<{ stripe_invoice_id: string; kind: string; status: string }>("invoices")[0];
    expect(inv.kind).toBe("net_terms");
    return { b, inv };
  }

  it("warns once before the due date, then cancels the booking, the Hostaway reservation and the invoice", async () => {
    const { b, inv } = await confirmedOnAccount();
    // Due in 36 hours: inside the 2-day warning window.
    await world.db
      .from("invoices")
      .update({ due_at: daysAhead(1.5) })
      .eq("stripe_invoice_id", inv.stripe_invoice_id);
    let r = await releaseUnpaidInvoices({ requestId: REQ });
    expect(r.notes).toBe("warned=1 released=0 failed=0");
    const warning = emailsOfType("invoice_release_warning");
    expect(warning).toHaveLength(1);
    expect(warning[0].to).toEqual(expect.arrayContaining(["ap@acme.test"])); // billing contact copied
    expect(booking(b.id).status).toBe("CONFIRMED");
    // Same window, next run: no second warning.
    r = await releaseUnpaidInvoices({ requestId: REQ });
    expect(r.notes).toBe("warned=0 released=0 failed=0");
    // Due date passed and still unpaid: released.
    await world.db
      .from("invoices")
      .update({ due_at: daysAgo(0.1) })
      .eq("stripe_invoice_id", inv.stripe_invoice_id);
    r = await releaseUnpaidInvoices({ requestId: REQ });
    expect(r.notes).toBe("warned=0 released=1 failed=0");
    const after = booking(b.id);
    expect(after.status).toBe("CANCELLED");
    expect(after.cancellation_reason).toContain("unpaid");
    expect(world.hostaway.calls.filter((c) => c.method === "cancelReservation")).toHaveLength(1);
    expect(world.db.rows<{ status: string }>("invoices")[0].status).toBe("void");
    expect(emailsOfType("booking_cancelled")).toHaveLength(1);
    expect(slackContaining("released")).toHaveLength(1);
    // Idempotent: nothing left to do.
    r = await releaseUnpaidInvoices({ requestId: REQ });
    expect(r.notes).toBe("warned=0 released=0 failed=0");
  });

  it("a paid invoice, or one not yet in the window, releases nothing", async () => {
    const { inv } = await confirmedOnAccount();
    await world.db
      .from("invoices")
      .update({ due_at: daysAhead(5) })
      .eq("stripe_invoice_id", inv.stripe_invoice_id);
    expect((await releaseUnpaidInvoices({ requestId: REQ })).notes).toBe("warned=0 released=0 failed=0");
    await world.db
      .from("invoices")
      .update({ due_at: daysAgo(1), status: "paid", amount_paid_cents: TOTAL_CENTS })
      .eq("stripe_invoice_id", inv.stripe_invoice_id);
    expect((await releaseUnpaidInvoices({ requestId: REQ })).notes).toBe("warned=0 released=0 failed=0");
    expect(emailsOfType("invoice_release_warning")).toHaveLength(0);
  });
});
