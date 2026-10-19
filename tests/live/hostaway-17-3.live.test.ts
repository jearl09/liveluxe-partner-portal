/**
 * §17.3 write-back rows against the REAL Hostaway TEST account (Phase 5 exit
 * criterion), with Stripe test mode for the money steps. `npm run verify:live -- hostaway`.
 * Client-level rows (401 / 429 / 5xx / circuit / timeout / drift) cannot be induced on
 * the real API; they are covered by tests/integration/hostaway-client-17-3.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/admin", () => import("./harness").then((m) => m.factories.admin()));
vi.mock("@/lib/db/server", () => import("./harness").then((m) => m.factories.server()));
vi.mock("@/lib/notifications/email", () => import("./harness").then((m) => m.factories.email()));
vi.mock("@/lib/notifications/slack", () => import("./harness").then((m) => m.factories.slack()));

import { hostaway } from "@/lib/hostaway/api";
import { toReservationLike, writeBackConfig } from "@/lib/hostaway/reservations";
import { runHostawayReconciliation } from "@/lib/jobs/reconcile-hostaway";
import { confirmBooking } from "@/lib/payments/confirm";
import { ensurePaymentIntent, syncPaymentIntent } from "@/lib/payments/intents";
import { cancelBooking } from "@/lib/requests/cancel";
import { approve } from "@/lib/requests/decide";
import { approveExtension, requestExtension } from "@/lib/requests/modifications";
import { getStripe } from "@/lib/stripe/client";
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

async function confirmed(daysToCheckIn: number, nights = 3) {
  const b = await seedBooking(f, { daysToCheckIn, nights });
  const view = await ensurePaymentIntent(await booking(b.id), "booker@example.com");
  await getStripe().paymentIntents.confirm(view.paymentIntentId, {
    payment_method: "pm_card_visa",
    return_url: "https://example.com/r",
  });
  await syncPaymentIntent(view.paymentIntentId);
  await approve(asUser(f, "ops")!, b.id, REQ);
  asUser(f, null);
  const out = await confirmBooking(b.id, REQ, "approval");
  expect(out.status).toBe("CONFIRMED");
  const row = await booking(b.id);
  live.created.reservations.push(row.hostaway_reservation_id!);
  return row;
}

beforeAll(async () => {
  f = await seedFixture();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(() => live.resetCaptured());

describe("§6.7 — create reservation (outbox) against the test account", () => {
  it("writes once with the idempotency key, the direct channel and the platform reference custom field, and reads it back", async () => {
    const b = await confirmed(120);
    const cfg = await writeBackConfig();
    const res = await hostaway.getReservation(b.hostaway_reservation_id!);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.arrivalDate).toBe(b.check_in);
    expect(res.data.departureDate).toBe(b.check_out);
    if (cfg.referenceCustomFieldId)
      expect(toReservationLike(res.data, cfg.referenceCustomFieldId).platformReference).toBe(b.reference);
    else
      console.warn(
        "settings.hostaway.reference_custom_field_id is not set — reference traceability (§6.7) not verified",
      );
    expect(b.hostaway_written_at).toBeTruthy();
    expect(b.hostaway_write_key).toBe(`ha:${b.id}`);
    // Idempotent: a second confirmation does not write again.
    const before = live.created.reservations.length;
    await confirmBooking(b.id, REQ, "job");
    expect((await booking(b.id)).hostaway_reservation_id).toBe(b.hostaway_reservation_id);
    expect(live.created.reservations.length).toBe(before);
  });
});

describe("§17.3 — reservation write times out, outcome unknown", () => {
  it.skip("cannot be induced on the real API; the resolution path (list by listing + dates, match by reference/guest, never write twice) is covered in-process and its query half is exercised by the duplicate test below.", () => {});
});

describe("§17.3 — duplicate reservation created in Hostaway", () => {
  it("a second live reservation for the same stay is found by reconciliation → CRITICAL with both ids", async () => {
    const b = await confirmed(140);
    const cfg = await writeBackConfig();
    const dup = await hostaway.createReservation(
      {
        listingMapId: f.hostawayListingId,
        channelId: cfg.channelId,
        arrivalDate: b.check_in,
        departureDate: b.check_out,
        guestFirstName: "Verify",
        guestLastName: "Duplicate",
        guestEmail: b.guest_email ?? undefined,
        numberOfGuests: 2,
        totalPrice: 1,
        currency: "AUD",
        ...(cfg.referenceCustomFieldId
          ? { customFieldValues: [{ customFieldId: cfg.referenceCustomFieldId, value: b.reference }] }
          : {}),
      },
      `${b.id}:verify-dup`,
    );
    expect(dup.ok).toBe(true);
    if (!dup.ok) return;
    live.created.reservations.push(dup.data.id);
    const r = await runHostawayReconciliation(REQ);
    expect(r.duplicates).toBeGreaterThanOrEqual(1);
    const crit = criticalContaining("Duplicate Hostaway reservation");
    expect(crit.length).toBeGreaterThanOrEqual(1);
    expect(crit[0].details?.keep).toBe(b.hostaway_reservation_id);
    expect(crit[0].details?.cancel).toContain(dup.data.id);
  });
});

describe("§17.3 — reservation cancelled directly in Hostaway", () => {
  it("cancelling in the test account marks the booking cancelled-upstream and raises the refund workflow", async () => {
    const b = await confirmed(160);
    const upd = await hostaway.cancelReservation(b.hostaway_reservation_id!, "guest", `${b.id}:verify-upstream-cancel`);
    expect(upd.ok).toBe(true);
    const r = await runHostawayReconciliation(REQ);
    expect(r.cancelledUpstream).toBeGreaterThanOrEqual(1);
    const after = await booking(b.id);
    expect(after.cancelled_upstream).toBe(true);
    expect(after.status).toBe("CONFIRMED");
    expect(criticalContaining("cancelled directly in Hostaway").length).toBeGreaterThanOrEqual(1);
    expect(emailsOfType("booking_cancelled")).toHaveLength(1);
  });
});

describe("§6.7 — update reservation (extension) and cancel reservation (ordering)", () => {
  it("an approved extension re-checks the new nights live and PUTs the new departure date", async () => {
    const b = await confirmed(180, 2);
    const newCheckOut = new Date(Date.parse(`${b.check_out}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const { quote } = await requestExtension(asUser(f, "booker")!, b.id, { newCheckOut, reason: "verify" }, REQ);
    expect(quote.nights).toBe(1);
    const { data: mods } = await live.db.from("booking_modifications").select("id").eq("booking_id", b.id);
    const done = await approveExtension(asUser(f, "ops")!, mods![0].id, "", REQ);
    asUser(f, null);
    expect(done.hostaway_status).toBe("updated");
    const res = await hostaway.getReservation(b.hostaway_reservation_id!);
    expect(res.ok && res.data.departureDate).toBe(newCheckOut);
    expect((await booking(b.id)).check_out).toBe(newCheckOut);
  });

  it("cancellation releases the reservation in Hostaway first, then refunds in Stripe", async () => {
    const b = await confirmed(200);
    const out = await cancelBooking(asUser(f, "ops")!, b.id, { reason: "other", note: "verify" }, REQ);
    asUser(f, null);
    expect(out.hostaway).toBe("cancelled");
    expect(out.refundOk).toBe(true);
    const res = await hostaway.getReservation(b.hostaway_reservation_id!);
    expect(res.ok && /cancel/i.test(res.data.status)).toBe(true);
  });
});
