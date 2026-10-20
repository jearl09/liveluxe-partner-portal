/**
 * Spec §17.3 (write-back rows) and the Phase 5 deliverables, exercised against the
 * real confirmation, reconciliation and post-confirmation code with the in-process
 * Hostaway "test account", Stripe and Postgres fakes.
 *
 *   write times out — outcome unknown      resolved by query, never written twice; ops alerted at 5 min
 *   duplicate reservation                  CRITICAL with both ids, exception recorded
 *   reservation cancelled directly         cancelled-upstream, partner + ops told, refund workflow raised
 *   unrecoverable write failure            FAILED, authorisation voided, ops paged (Appendix B)
 *   transient write failure                stays APPROVED, retried by the drain job
 *   clock skew                             clamped and logged
 *   SLA escalation ladder                  50 % email, 100 % breached, 150 % hold extended + partner told
 *   check-in pack release                  T-48h job, manual release, logged views, purge after completion
 *   completion                             CHECKED_IN on arrival, COMPLETED after departure
 *   extensions                             new nights only, live re-check, Hostaway PUT, supplementary invoice,
 *                                          alternatives when unavailable
 *   cancellation                           Hostaway first, then refund; cancel reservation failure is CRITICAL
 *
 * The live pass against the real test account is scripts/verify-hostaway-17-3.mjs.
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
const priceControl = { unavailable: false };
vi.mock("@/lib/listings/price", () => ({
  priceStay: async (_listingId: string, stay: { checkIn: string; checkOut: string }) => {
    const nights = Math.round((Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86_400_000);
    const { IDS } = await import("./fakes/world");
    if (priceControl.unavailable)
      return {
        detail: { listing: {} },
        days: [],
        availability: {
          available: false,
          nights,
          missingDates: [],
          unavailableDates: [stay.checkIn],
          unpricedDates: [],
        },
        quote: null,
      };
    const lines = [
      { kind: "accommodation", label: `Accommodation (${nights} nights)`, amountCents: nights * 25_000 },
      { kind: "cleaning_fee", label: "Cleaning fee", amountCents: 20_000 },
      { kind: "tax", label: "GST (10%)", amountCents: Math.round((nights * 25_000 + 20_000) * 0.1) },
    ];
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
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
      availability: { available: true, nights, missingDates: [], unavailableDates: [], unpricedDates: [] },
      quote: {
        lines,
        subtotalCents: total,
        taxCents: lines[2].amountCents,
        totalCents: total,
        nightlyAverageCents: 25_000,
        nights,
        securityDepositCents: 0,
        rateCardId: null,
        rateCardVersion: null,
        priceHash: "h",
      },
    };
  },
}));

import { drainWebhooks, resumeConfirmations } from "@/lib/jobs/drain-webhooks";
import { completeStays } from "@/lib/jobs/complete-stays";
import { runHostawayReconciliation } from "@/lib/jobs/reconcile-hostaway";
import { releaseCheckinJob } from "@/lib/jobs/release-checkin";
import { slaEscalation } from "@/lib/jobs/sla-escalation";
import { confirmBooking } from "@/lib/payments/confirm";
import { latestPayment } from "@/lib/payments/intents";
import { cancelBooking } from "@/lib/requests/cancel";
import { loadCheckinPack, releaseCheckinNow } from "@/lib/requests/checkin";
import { approve } from "@/lib/requests/decide";
import { approveExtension, declineModification, requestExtension } from "@/lib/requests/modifications";
import {
  asUser,
  booking,
  claimsFor,
  criticalContaining,
  emailsOfType,
  enableHostawayTestWrites,
  HOSTAWAY_LISTING_ID,
  IDS,
  placeHold,
  seedBooking,
  seedWorld,
  slackContaining,
  world,
} from "./fakes/world";

const REQ = "req-test";
const iso = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();
const date = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

async function approvedWithHold(patch: Parameters<typeof seedBooking>[0] = {}) {
  const b = seedBooking(patch);
  await placeHold(b.id);
  await approve(claimsFor("ops"), b.id, REQ);
  asUser(null);
  return booking(b.id);
}

async function confirmedBooking(patch: Parameters<typeof seedBooking>[0] = {}) {
  const b = await approvedWithHold(patch);
  const out = await confirmBooking(b.id, REQ, "approval");
  expect(out.status).toBe("CONFIRMED");
  return booking(b.id);
}

beforeEach(async () => {
  world.reset();
  seedWorld();
  await enableHostawayTestWrites(true);
});

describe("§17.3 — reservation write times out, outcome unknown", () => {
  it("the write landed: resolved by listing reservations, never written twice, confirmed", async () => {
    const b = await approvedWithHold();
    world.hostaway.timeoutButLanded = true;
    world.hostaway.next.createReservation = { ok: false, status: 0, code: "TIMEOUT", message: "timed out" };
    const out = await confirmBooking(b.id, REQ, "approval");
    expect(out.status).toBe("CONFIRMED");
    expect(world.hostaway.calls.filter((c) => c.method === "createReservation")).toHaveLength(1);
    expect(world.hostaway.calls.filter((c) => c.method === "listReservations")).toHaveLength(1);
    expect(world.hostaway.reservations.size).toBe(1);
    expect(booking(b.id).hostaway_reservation_id).toBe([...world.hostaway.reservations.keys()][0]);
    expect(world.timeline.indexOf("stripe:paymentIntents.capture")).toBeGreaterThan(
      world.timeline.indexOf("hostaway:listReservations"),
    );
    // The outbox trail: attempt + result audit rows, key stored, timestamps stamped.
    const audits = world.db.rows<{ action: string }>("audit_log").map((a) => a.action);
    expect(audits).toContain("hostaway.reservation.create.attempt");
    expect(audits).toContain("hostaway.reservation.create.result");
    const after = booking(b.id);
    expect(after.hostaway_write_key).toBe(`ha:${b.id}`);
    expect(after.hostaway_write_attempted_at).toBeTruthy();
    expect(after.hostaway_written_at).toBeTruthy();
  });

  it("the write did not land: HOSTAWAY_WRITE_AMBIGUOUS, stays APPROVED, no capture, retried by the drain job, ops alerted after 5 minutes", async () => {
    const b = await approvedWithHold();
    world.hostaway.next.createReservation = { ok: false, status: 0, code: "TIMEOUT", message: "timed out" };
    const out = await confirmBooking(b.id, REQ, "approval");
    expect(out.status).toBe("APPROVED");
    expect(out.note).toContain("HOSTAWAY_WRITE_AMBIGUOUS");
    expect(criticalContaining("write ambiguous")).toHaveLength(1);
    expect(world.stripe.calls.filter((c) => c.method === "paymentIntents.capture")).toHaveLength(0);
    expect(booking(b.id).hostaway_write_attempts).toBe(1);
    expect(booking(b.id).hostaway_last_error).toBe("HOSTAWAY_WRITE_AMBIGUOUS");
    // Drain job within the window: retries (Hostaway healthy now) and confirms.
    await world.db
      .from("booking_requests")
      .update({ approved_at: iso(-2) })
      .eq("id", b.id);
    const r1 = await resumeConfirmations(REQ);
    expect(r1.resumed).toBe(1);
    expect(booking(b.id).status).toBe("CONFIRMED");
    expect(world.hostaway.reservations.size).toBe(1);
    expect(booking(b.id).hostaway_write_attempts).toBe(2);
  });

  it("unresolved after 5 minutes: ops alerted exactly once", async () => {
    const b = await approvedWithHold();
    world.hostaway.next.createReservation = { ok: false, status: 503, code: "SERVER_ERROR", message: "HTTP 503" };
    await confirmBooking(b.id, REQ, "approval");
    await world.db
      .from("booking_requests")
      .update({ approved_at: iso(-6) })
      .eq("id", b.id);
    world.hostaway.next.createReservation = { ok: false, status: 503, code: "SERVER_ERROR", message: "HTTP 503" };
    const r = await resumeConfirmations(REQ);
    expect(r.alerted).toBe(1);
    expect(criticalContaining("still has no Hostaway reservation")).toHaveLength(1);
    world.hostaway.next.createReservation = { ok: false, status: 503, code: "SERVER_ERROR", message: "HTTP 503" };
    expect((await resumeConfirmations(REQ)).alerted).toBe(0);
    expect(booking(b.id).status).toBe("APPROVED");
    expect(booking(b.id).hostaway_write_attempts).toBe(3);
  });
});

describe("§17.3 — Hostaway 5xx / circuit open at approval and at write time", () => {
  it("approval is blocked with HOSTAWAY_UNAVAILABLE when the live re-check cannot run", async () => {
    const b = seedBooking();
    await placeHold(b.id);
    world.hostaway.next.getCalendar = { ok: false, status: 503, code: "SERVER_ERROR", message: "HTTP 503" };
    await expect(approve(claimsFor("ops"), b.id, REQ)).rejects.toMatchObject({ code: "HOSTAWAY_UNAVAILABLE" });
    expect(booking(b.id).status).toBe("UNDER_REVIEW");
    world.hostaway.next.getCalendar = { ok: false, status: 0, code: "CIRCUIT_OPEN", message: "open" };
    await expect(approve(claimsFor("ops"), b.id, REQ)).rejects.toMatchObject({
      code: "HOSTAWAY_UNAVAILABLE",
      details: { code: "CIRCUIT_OPEN" },
    });
    // Recovers when the service returns (E2E scenario 16).
    expect((await approve(claimsFor("ops"), b.id, REQ)).status).toBe("APPROVED");
  });

  it("a transient write failure keeps the booking APPROVED, un-captured, and the drain job completes it later", async () => {
    const b = await approvedWithHold();
    world.hostaway.next.createReservation = { ok: false, status: 0, code: "CIRCUIT_OPEN", message: "open" };
    const out = await confirmBooking(b.id, REQ, "approval");
    expect(out.status).toBe("APPROVED");
    expect(world.stripe.calls.filter((c) => c.method === "paymentIntents.capture")).toHaveLength(0);
    expect((await latestPayment(b.id))!.status).toBe("requires_capture");
    await world.db
      .from("booking_requests")
      .update({ approved_at: iso(-2) })
      .eq("id", b.id);
    const r = await drainWebhooks({ requestId: REQ });
    expect(r.notes).toContain("confirmsResumed=1");
    expect(booking(b.id).status).toBe("CONFIRMED");
  });

  it("an unrecoverable write rejection → FAILED, authorisation voided, ops paged (Appendix B)", async () => {
    const b = await approvedWithHold();
    const { paymentIntentId } = { paymentIntentId: (await latestPayment(b.id))!.stripe_payment_intent_id };
    world.hostaway.next.createReservation = {
      ok: false,
      status: 200,
      code: "ENVELOPE_FAIL",
      message: "Dates not available",
    };
    const out = await confirmBooking(b.id, REQ, "approval");
    expect(out.status).toBe("FAILED");
    expect(booking(b.id).status).toBe("FAILED");
    expect(world.stripe.pi(paymentIntentId).status).toBe("canceled");
    expect(criticalContaining("booking FAILED")).toHaveLength(1);
    expect(world.stripe.calls.filter((c) => c.method === "paymentIntents.capture")).toHaveLength(0);
  });
});

describe("§17.3 — duplicate reservation created in Hostaway", () => {
  it("reconciliation finds two live reservations for one booking → CRITICAL with both ids, exception recorded", async () => {
    const b = await confirmedBooking();
    const dupId = world.hostaway.duplicate(b.hostaway_reservation_id!);
    const r = await runHostawayReconciliation(REQ);
    expect(r.duplicates).toBe(1);
    const crit = criticalContaining("Duplicate Hostaway reservation");
    expect(crit).toHaveLength(1);
    expect(crit[0].details).toMatchObject({ keep: b.hostaway_reservation_id, cancel: [dupId] });
    const ex = world.db.rows<{ kind: string; external_id: string; resolved_at: string | null }>(
      "reconciliation_exceptions",
    );
    expect(ex.find((e) => e.kind === "duplicate_reservation")?.external_id).toBe(
      `${b.hostaway_reservation_id},${dupId}`,
    );
    // Guided cancellation of the duplicate clears the exception on the next run.
    world.hostaway.cancelUpstream(dupId);
    await runHostawayReconciliation(REQ);
    expect(ex.find((e) => e.kind === "duplicate_reservation")?.resolved_at).toBeTruthy();
    expect(booking(b.id).status).toBe("CONFIRMED");
  });
});

describe("§17.3 — reservation cancelled directly in Hostaway", () => {
  it("booking marked cancelled-upstream, partner and ops notified CRITICAL, refund workflow raised for finance", async () => {
    const b = await confirmedBooking();
    world.hostaway.cancelUpstream(b.hostaway_reservation_id!);
    const r = await runHostawayReconciliation(REQ);
    expect(r.cancelledUpstream).toBe(1);
    const after = booking(b.id);
    expect(after.cancelled_upstream).toBe(true);
    expect(after.cancelled_upstream_at).toBeTruthy();
    expect(after.status).toBe("CONFIRMED"); // a human decides the refund and relocation; never an automated cancel
    expect(criticalContaining("cancelled directly in Hostaway")).toHaveLength(1);
    expect(emailsOfType("booking_cancelled")).toHaveLength(1);
    const ex = world.db.rows<{ kind: string; entity_id: string }>("reconciliation_exceptions");
    expect(ex.some((e) => e.kind === "cancelled_upstream_refund" && e.entity_id === b.id)).toBe(true);
    // Idempotent: a second run does not re-alert or re-email.
    await runHostawayReconciliation(REQ);
    expect(criticalContaining("cancelled directly in Hostaway")).toHaveLength(1);
    expect(emailsOfType("booking_cancelled")).toHaveLength(1);
    // Finance then cancels with the refund they decide; the reservation is already gone upstream.
    const out = await cancelBooking(
      claimsFor("finance"),
      b.id,
      { reason: "other", note: "cancelled by owner", overrideRefundCents: 297_000 },
      REQ,
    );
    expect(out.refundOk).toBe(true);
    expect(booking(b.id).status).toBe("CANCELLED");
  });

  it("a confirmed booking whose reservation vanished is CRITICAL", async () => {
    const b = await confirmedBooking();
    world.hostaway.reservations.delete(b.hostaway_reservation_id!);
    const r = await runHostawayReconciliation(REQ);
    expect(r.missing).toBe(1);
    expect(criticalContaining("no matching reservation")).toHaveLength(1);
  });

  it("§17.3 clock skew: an upstream timestamp in the future is clamped and counted, not trusted", async () => {
    const b = await confirmedBooking();
    world.hostaway.reservations.get(b.hostaway_reservation_id!)!.updatedOn = new Date(
      Date.now() + 3_600_000,
    ).toISOString();
    const r = await runHostawayReconciliation(REQ);
    expect(r.skewed).toBe(1);
    expect(r.cancelledUpstream).toBe(0);
  });

  it("reconciliation exceptions older than 24 h raise HIGH once", async () => {
    const b = await confirmedBooking();
    world.hostaway.duplicate(b.hostaway_reservation_id!);
    await runHostawayReconciliation(REQ);
    const ex = world.db.rows<{ id: string; first_seen_at: string }>("reconciliation_exceptions")[0];
    await world.db
      .from("reconciliation_exceptions")
      .update({ first_seen_at: new Date(Date.now() - 25 * 3_600_000).toISOString() })
      .eq("id", ex.id);
    await runHostawayReconciliation(REQ);
    expect(slackContaining("*HIGH*")).toHaveLength(1);
    await runHostawayReconciliation(REQ);
    expect(slackContaining("*HIGH*")).toHaveLength(1);
  });
});

describe("§6.7 cancel reservation: Hostaway first, then Stripe", () => {
  it("partner self-service cancellation before the cut-off releases Hostaway, then refunds (E2E scenario 12)", async () => {
    const b = await confirmedBooking({ daysToCheckIn: 30 });
    const out = await cancelBooking(claimsFor("booker"), b.id, { reason: "claim_closed", note: "" }, REQ);
    expect(out.hostaway).toBe("cancelled");
    expect(out.refundOk).toBe(true);
    expect(world.hostaway.reservations.get(b.hostaway_reservation_id!)?.status).toBe("cancelled");
    // The dedicated status endpoint, not a general update: only it releases the nights in Hostaway.
    const cancelCall = world.hostaway.calls.find((c) => c.method === "cancelReservation")!;
    expect(cancelCall.args[1]).toBe("host");
    expect(world.hostaway.calls.filter((c) => c.method === "updateReservation")).toHaveLength(0);
    expect(world.timeline.indexOf("stripe:refunds.create")).toBeGreaterThan(
      world.timeline.indexOf("hostaway:cancelReservation"),
    );
    expect(booking(b.id).status).toBe("CANCELLED");
  });

  it("inside the cut-off the partner can only ask; the Hostaway cancel failure is CRITICAL but the refund still follows", async () => {
    const b = await confirmedBooking({ daysToCheckIn: 3 });
    await expect(
      cancelBooking(claimsFor("booker"), b.id, { reason: "claim_closed", note: "" }, REQ),
    ).rejects.toMatchObject({ code: "CANCELLATION_REQUIRES_APPROVAL" });
    world.hostaway.next.cancelReservation = { ok: false, status: 503, code: "SERVER_ERROR", message: "HTTP 503" };
    const out = await cancelBooking(claimsFor("ops"), b.id, { reason: "other", note: "" }, REQ);
    expect(out.hostaway).toBe("failed");
    expect(criticalContaining("reservation cancel failed")).toHaveLength(1);
    expect(booking(b.id).status).toBe("CANCELLED");
  });
});

describe("§10.5 / §17.5 — SLA escalation ladder", () => {
  function pending(elapsedPct: number) {
    const windowMs = 4 * 3_600_000;
    const submitted = Date.now() - (windowMs * elapsedPct) / 100;
    return seedBooking({
      submitted_at: new Date(submitted).toISOString(),
      decision_due_at: new Date(submitted + windowMs).toISOString(),
      hold_expires_at: iso(60),
      assigned_to: IDS.ops,
    });
  }

  it("50 %: email + in-app to the assigned ops user; 100 %: Slack flagged breached", async () => {
    const b = pending(55);
    let r = await slaEscalation({ requestId: REQ });
    expect(r.changed).toBe(1);
    expect(emailsOfType("sla_escalation")).toHaveLength(1);
    expect(emailsOfType("sla_escalation")[0].to).toEqual(["ops@liveluxe.test"]);
    expect(
      world.db
        .rows<{ type: string; user_id: string }>("notifications")
        .filter((n) => n.type === "sla_escalation" && n.user_id === IDS.ops),
    ).toHaveLength(1);
    expect(booking(b.id).sla_escalation_pct).toBe(50);
    r = await slaEscalation({ requestId: REQ }); // same rung: nothing new
    expect(r.changed).toBe(0);
    await world.db
      .from("booking_requests")
      .update({ submitted_at: iso(-4.2 * 60), decision_due_at: iso(-0.2 * 60) })
      .eq("id", b.id);
    await slaEscalation({ requestId: REQ });
    expect(booking(b.id).sla_escalation_pct).toBe(100);
    expect(slackContaining("flagged breached")).toHaveLength(1);
  });

  it("150 %: the hold is auto-extended rather than expired and the partner is told the truth", async () => {
    const b = pending(160);
    const before = booking(b.id).hold_expires_at!;
    await slaEscalation({ requestId: REQ });
    const after = booking(b.id);
    expect(after.sla_escalation_pct).toBe(150);
    expect(Date.parse(after.hold_expires_at!)).toBeGreaterThan(Date.parse(before));
    expect(after.sla_extended_at).toBeTruthy();
    expect(emailsOfType("still_reviewing")).toHaveLength(1);
    expect(world.db.find<{ expires_at: string }>("inventory_holds", (h) => h.booking_id === b.id)!.expires_at).toBe(
      after.hold_expires_at,
    );
  });
});

describe("§10.6 — check-in pack release, access log, completion and purge", () => {
  it("released by the hourly job at check-in minus the offset; not before; partner reads it through the logged RPC", async () => {
    const b = await confirmedBooking({ daysToCheckIn: 1, nights: 5 }); // tomorrow 15:00 local → T-48h has passed
    const far = await confirmedBooking({ daysToCheckIn: 10 });
    const r = await releaseCheckinJob({ requestId: REQ });
    expect(r.changed).toBe(1);
    expect(booking(b.id).checkin_released_at).toBeTruthy();
    expect(booking(far.id).checkin_released_at).toBeNull();
    expect(emailsOfType("checkin_ready")).toHaveLength(1);
    expect(world.db.rows<{ action: string }>("audit_log").some((a) => a.action === "booking.checkin_released")).toBe(
      true,
    );
    asUser("booker");
    const pack = await loadCheckinPack(b.id);
    expect(pack?.door_code).toBe("4471#");
    expect(
      world.db.rows<{ booking_id: string }>("checkin_access_log").filter((l) => l.booking_id === b.id),
    ).toHaveLength(1);
    expect(await loadCheckinPack(far.id)).toBeNull(); // not released yet
    // Idempotent rerun.
    expect((await releaseCheckinJob({ requestId: REQ })).changed).toBe(0);
  });

  it("ops can release early; the release is logged with the actor", async () => {
    const b = await confirmedBooking({ daysToCheckIn: 10 });
    expect(await releaseCheckinNow(claimsFor("ops"), b.id, REQ)).toBe(true);
    expect(booking(b.id).checkin_released_at).toBeTruthy();
    const audit = world.db
      .rows<{ action: string; actor_type: string; actor_id: string }>("audit_log")
      .find((a) => a.action === "booking.checkin_released")!;
    expect(audit.actor_type).toBe("livluxe");
    expect(audit.actor_id).toBe(IDS.ops);
    expect(await releaseCheckinNow(claimsFor("ops"), b.id, REQ)).toBe(false);
  });

  it("CHECKED_IN on arrival, COMPLETED after departure, credentials purged after the retention window", async () => {
    const b = await confirmedBooking({ daysToCheckIn: 0, nights: 2 });
    let r = await completeStays({ requestId: REQ });
    expect(r.notes).toContain("checkedIn=1");
    expect(booking(b.id).status).toBe("CHECKED_IN");
    await world.db
      .from("booking_requests")
      .update({ check_in: date(-5), check_out: date(-3), checkin_released_at: iso(-7200) })
      .eq("id", b.id);
    r = await completeStays({ requestId: REQ });
    expect(r.notes).toContain("completed=1");
    const done = booking(b.id);
    expect(done.status).toBe("COMPLETED");
    expect(done.credentials_purge_at).toBeTruthy();
    expect(world.db.rows<{ type: string }>("notifications").some((n) => n.type === "feedback_prompt")).toBe(true);
    await world.db
      .from("booking_requests")
      .update({ credentials_purge_at: iso(-1) })
      .eq("id", b.id);
    r = await completeStays({ requestId: REQ });
    expect(r.notes).toContain("purged=1");
    asUser("booker");
    expect(await loadCheckinPack(b.id)).toBeNull();
  });
});

describe("§10.6 — extensions", () => {
  it("quotes only the new nights, re-checks live, updates Hostaway, re-engages the exclusion constraint, raises a supplementary invoice", async () => {
    const b = await confirmedBooking({ daysToCheckIn: 20, nights: 10 });
    const newCheckOut = date(33);
    const { quote } = await requestExtension(
      claimsFor("booker"),
      b.id,
      { newCheckOut, reason: "Rebuild overran" },
      REQ,
    );
    expect(quote.nights).toBe(3);
    expect(quote.lines.some((l) => l.kind === "cleaning_fee")).toBe(false);
    expect(quote.totalCents).toBe(3 * 25_000 + Math.round((3 * 25_000 + 20_000) * 0.1));
    const mod = world.db.rows<{ id: string }>("booking_modifications")[0];
    const done = await approveExtension(claimsFor("ops"), mod.id, "", REQ);
    expect(done.status).toBe("approved");
    expect(done.hostaway_status).toBe("updated");
    const calendar = world.hostaway.calls.filter((c) => c.method === "getCalendar").at(-1)!;
    expect(calendar.args.slice(1)).toEqual([b.check_out, newCheckOut]); // only the added nights, not the whole stay
    const upd = world.hostaway.calls.find((c) => c.method === "updateReservation")!;
    expect((upd.args[1] as { departureDate: string }).departureDate).toBe(newCheckOut);
    const after = booking(b.id);
    expect(after.check_out).toBe(newCheckOut);
    expect(after.total_cents).toBe(297_000 + quote.totalCents);
    const inv = world.db
      .rows<{ kind: string; status: string; amount_due_cents: number }>("invoices")
      .find((i) => i.kind === "supplementary")!;
    expect(inv.status).toBe("open");
    expect(inv.amount_due_cents).toBe(quote.totalCents);
    expect(emailsOfType("modification_decided")).toHaveLength(1);
  });

  it("unavailable nights: the nearest alternatives are surfaced with a relocation note; live conflict at approval is caught", async () => {
    const b = await confirmedBooking({ daysToCheckIn: 20, nights: 10 });
    // Another partner's confirmed booking takes the following nights on this property.
    seedBooking({ status: "CONFIRMED", daysToCheckIn: 31, nights: 5, org_id: IDS.org, reference: "LLX-2026-000777" });
    priceControl.unavailable = true;
    try {
      await expect(
        requestExtension(claimsFor("booker"), b.id, { newCheckOut: date(33), reason: "" }, REQ),
      ).rejects.toMatchObject({ code: "EXTENSION_UNAVAILABLE" });
    } finally {
      priceControl.unavailable = false;
    }
    const mod = world.db.rows<{ status: string; alternatives: { listingId: string }[] }>("booking_modifications")[0];
    expect(mod.status).toBe("declined");
    expect(mod.alternatives.map((a) => a.listingId)).toEqual([IDS.listing2]);
  });

  it("a live calendar conflict on the added nights blocks approval; decline emails the partner", async () => {
    const b = await confirmedBooking({ daysToCheckIn: 20, nights: 10 });
    await requestExtension(claimsFor("booker"), b.id, { newCheckOut: date(32), reason: "" }, REQ);
    const mod = world.db.rows<{ id: string }>("booking_modifications")[0];
    world.hostaway.blockedDates.add(date(31));
    await expect(approveExtension(claimsFor("ops"), mod.id, "", REQ)).rejects.toMatchObject({
      code: "EXTENSION_UNAVAILABLE",
      details: { source: "hostaway_live" },
    });
    expect(booking(b.id).check_out).toBe(b.check_out);
    expect(world.hostaway.calls.filter((c) => c.method === "updateReservation")).toHaveLength(0);
    await declineModification(claimsFor("ops"), mod.id, "Owner has the dates", REQ);
    expect(emailsOfType("modification_decided")).toHaveLength(1);
    expect(world.db.rows<{ status: string }>("booking_modifications")[0].status).toBe("declined");
  });
});

describe("Hostaway writes stay skipped (never faked) when the switch is off", () => {
  it("confirmation reports the skip and ops see it", async () => {
    await enableHostawayTestWrites(false);
    const b = await approvedWithHold();
    const out = await confirmBooking(b.id, REQ, "approval");
    expect(out.status).toBe("CONFIRMED");
    expect(out.note).toContain("hostaway=skipped");
    expect(world.hostaway.calls.filter((c) => c.method === "createReservation")).toHaveLength(0);
    expect(slackContaining("writes disabled here")).toHaveLength(1);
    expect(booking(b.id).hostaway_reservation_id).toBeNull();
    expect(world.hostaway.calls.length).toBe(1); // only the live availability re-check at approval
    expect(world.hostaway.calls[0].method).toBe("getCalendar");
    expect(HOSTAWAY_LISTING_ID).toBe(70001);
  });
});

describe("terms for the stay on approval (David, 20 Oct 2026)", () => {
  it("a 30-night stay cannot be approved without terms; with them they are stored on the booking", async () => {
    const b = seedBooking({ nights: 30 });
    await placeHold(b.id);
    await expect(approve(claimsFor("ops"), b.id, REQ)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(booking(b.id).status).not.toBe("APPROVED");
    const terms = "Invoiced monthly in advance; 14 days notice to end the stay early; weekly clean included.";
    await approve(claimsFor("ops"), b.id, REQ, { stayTerms: terms });
    const after = booking(b.id);
    expect(after.status).toBe("APPROVED");
    expect(after.stay_terms).toBe(terms);
  });

  it("a short stay approves without terms, and keeps any terms given", async () => {
    const b = seedBooking({ nights: 5 });
    await placeHold(b.id);
    await approve(claimsFor("ops"), b.id, REQ, { stayTerms: "Late check-out agreed." });
    expect(booking(b.id).stay_terms).toBe("Late check-out agreed.");
  });
});
