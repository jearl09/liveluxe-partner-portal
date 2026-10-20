/**
 * The shared test world: one fake Postgres, one fake Stripe, one fake Hostaway
 * test account, captured emails / Slack / critical alerts, and seed data for a
 * partner org, its booker, a Live Luxe ops user, a listing and a booking.
 *
 * Test files install the module mocks with `installWorldMocks()` (hoisted
 * vi.mock calls) and reset the world in beforeEach.
 */
import type { BookingRequestRow } from "@/lib/db/types";
import { FakeDb } from "./db";
import { FakeHostaway } from "./hostaway";
import { FakeStripe } from "./stripe";

export interface Captured {
  emails: { to: string | string[]; subject: string; idempotencyKey: string; tags?: Record<string, string> }[];
  slack: { channel: string; text: string }[];
  critical: { condition: string; details?: Record<string, unknown> }[];
}

export const world = {
  db: new FakeDb(),
  stripe: new FakeStripe(),
  hostaway: new FakeHostaway(),
  captured: { emails: [], slack: [], critical: [] } as Captured,
  claims: null as null | { sub: string; org_id: string; role: string; email?: string },
  /** Every outbound call to either system, in order: "stripe:paymentIntents.capture", "hostaway:createReservation", … */
  timeline: [] as string[],
  reset() {
    this.db.reset();
    this.stripe.reset();
    this.hostaway.reset();
    this.captured = { emails: [], slack: [], critical: [] };
    this.claims = null;
    this.timeline = [];
    this.stripe.onCall = (m) => this.timeline.push(`stripe:${m}`);
    this.hostaway.onCall = (m) => this.timeline.push(`hostaway:${m}`);
  },
};

export const IDS = {
  org: "11111111-1111-4111-8111-111111111111",
  internalOrg: "11111111-1111-4111-8111-000000000000",
  booker: "22222222-2222-4222-8222-222222222222",
  bookerAuth: "22222222-2222-4222-8222-222222222200",
  partnerAdmin: "22222222-2222-4222-8222-222222222223",
  partnerAdminAuth: "22222222-2222-4222-8222-222222222230",
  ops: "33333333-3333-4333-8333-333333333333",
  opsAuth: "33333333-3333-4333-8333-333333333300",
  finance: "33333333-3333-4333-8333-333333333334",
  financeAuth: "33333333-3333-4333-8333-333333333340",
  listing: "44444444-4444-4444-8444-444444444444",
  listing2: "44444444-4444-4444-8444-444444444445",
  quote: "55555555-5555-4555-8555-555555555555",
};

export const HOSTAWAY_LISTING_ID = 70001;

const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
const date = (daysFromNow: number) => iso(daysFromNow).slice(0, 10);

export const QUOTE_LINES = [
  { kind: "accommodation", label: "Accommodation (10 nights)", amountCents: 250_000 },
  { kind: "cleaning_fee", label: "Cleaning fee", amountCents: 20_000 },
  { kind: "tax", label: "GST (10%)", amountCents: 27_000 },
];
export const TOTAL_CENTS = 297_000;

export function seedWorld(
  opts: {
    paymentTerms?: "prepay" | "deposit" | "net14" | "net30";
    creditLimitCents?: number | null;
    depositPct?: number | null;
  } = {},
) {
  const db = world.db;
  db.seed("settings", [
    { key: "hold.duration_hours", value: 48 },
    { key: "sla.default_hours", value: 4 },
    { key: "sla.escalation_pcts", value: [50, 80, 100, 150] },
    { key: "deposit.default_pct", value: 20 },
    { key: "deposit.balance_due_days_before_checkin", value: 14 },
    { key: "invoice.due_days_before_checkin", value: 7 },
    { key: "invoice.release_warning_days", value: 2 },
    { key: "stay.long_stay_terms_from_nights", value: 28 },
    { key: "cancellation.cutoff_days", value: 14 },
    { key: "cancellation.retention_schedule", value: [] },
    { key: "checkin.release_offset_hours", value: 48 },
    { key: "checkin.door_code_offset_hours", value: 24 },
    { key: "checkin.purge_after_days", value: 7 },
    { key: "authorisation.max_age_days", value: 5 },
    { key: "credit.over_limit_action", value: "block" },
    { key: "dunning.reminder_days", value: [1, 7, 14] },
    { key: "dunning.finance_approval_after_days", value: 14 },
    { key: "dunning.suspend_after_days", value: 30 },
    { key: "dunning.failed_attempts_to_finance", value: 2 },
    { key: "payment.retry_grace_minutes", value: 60 },
    { key: "payment.resume_reminder_minutes", value: 60 },
    { key: "approval.ops_value_ceiling_cents", value: null },
    { key: "reconciliation.alert_after_hours", value: 24 },
    { key: "confirm.unresolved_alert_minutes", value: 5 },
    { key: "hostaway.direct_channel_id", value: 2017 },
    { key: "hostaway.reference_custom_field_id", value: 91 },
  ]);
  db.seed("partner_orgs", [
    {
      id: IDS.org,
      name: "Acme Insurance",
      type: "insurance",
      status: "active",
      payment_terms: opts.paymentTerms ?? "prepay",
      credit_limit_cents: opts.creditLimitCents ?? null,
      deposit_pct: opts.depositPct ?? null,
      billing_email: "ap@acme.test",
      billing_contact_name: "AP Team",
      finance_contact_email: "finance@liveluxe.test",
      is_internal: false,
      require_claim_ref: false,
      require_po_number: false,
      email_domains: [],
      hard_holds: false,
    },
    { id: IDS.internalOrg, name: "Live Luxe", type: "other", status: "active", is_internal: true, email_domains: [] },
  ]);
  db.seed("partner_users", [
    {
      id: IDS.booker,
      auth_user_id: IDS.bookerAuth,
      org_id: IDS.org,
      role: "partner_booker",
      email: "booker@acme.test",
      full_name: "Bea Booker",
      status: "active",
    },
    {
      id: IDS.partnerAdmin,
      auth_user_id: IDS.partnerAdminAuth,
      org_id: IDS.org,
      role: "partner_admin",
      email: "admin@acme.test",
      full_name: "Adam Admin",
      status: "active",
    },
    {
      id: IDS.ops,
      auth_user_id: IDS.opsAuth,
      org_id: IDS.internalOrg,
      role: "livluxe_ops",
      email: "ops@liveluxe.test",
      full_name: "Olivia Ops",
      status: "active",
    },
    {
      id: IDS.finance,
      auth_user_id: IDS.financeAuth,
      org_id: IDS.internalOrg,
      role: "livluxe_finance",
      email: "finance@liveluxe.test",
      full_name: "Finn Finance",
      status: "active",
    },
  ]);
  db.seed("listings", [
    {
      id: IDS.listing,
      hostaway_listing_id: HOSTAWAY_LISTING_ID,
      public_name: "Southbank Riverside 2BR",
      suburb: "Southbank",
      state: "VIC",
      postcode: "3006",
      address_line: "12 Riverside Quay",
      timezone: "Australia/Melbourne",
      max_guests: 4,
      max_pets: 0,
      min_nights: 1,
      max_nights: null,
      currency: "AUD",
      checkin_from: "15:00",
      checkin_to: "21:00",
      checkout_by: "10:00",
      is_active: true,
      is_partner_visible: true,
      checkin_release_offset_hours: null,
    },
    {
      id: IDS.listing2,
      hostaway_listing_id: HOSTAWAY_LISTING_ID + 1,
      public_name: "Southbank Skyline 1BR",
      suburb: "Southbank",
      state: "VIC",
      postcode: "3006",
      timezone: "Australia/Melbourne",
      max_guests: 2,
      max_pets: 0,
      min_nights: 1,
      currency: "AUD",
      is_active: true,
      is_partner_visible: true,
    },
  ]);
  db.seed("listing_access_details", [
    {
      listing_id: IDS.listing,
      door_code: "4471#",
      wifi_ssid: "Riverside-Guest",
      wifi_password: "welcome2026",
      checkin_instructions: "Lift to level 4.",
      parking_notes: "Bay 12",
      emergency_contact: "0400 000 000",
    },
  ]);
  db.seed("quotes", [
    {
      id: IDS.quote,
      listing_id: IDS.listing,
      org_id: IDS.org,
      created_by: IDS.booker,
      check_in: date(20),
      check_out: date(30),
      guests_adults: 2,
      guests_children: 0,
      guests_pets: 0,
      line_items: QUOTE_LINES,
      subtotal_cents: 270_000,
      tax_cents: 27_000,
      total_cents: TOTAL_CENTS,
      deposit_cents: 0,
      currency: "AUD",
      price_hash: "hash",
      expires_at: iso(2),
    },
  ]);
}

let refSeq = 1;
export function seedBooking(
  patch: Partial<BookingRequestRow> & { daysToCheckIn?: number; nights?: number } = {},
): BookingRequestRow {
  const { daysToCheckIn = 20, nights = 10, ...rest } = patch;
  const checkIn = date(daysToCheckIn);
  const checkOut = date(daysToCheckIn + nights);
  const row = world.db.insertRow("booking_requests", {
    reference: `LLX-2026-${String(refSeq++).padStart(6, "0")}`,
    org_id: IDS.org,
    listing_id: IDS.listing,
    quote_id: IDS.quote,
    created_by: IDS.booker,
    on_behalf_of: false,
    status: "UNDER_REVIEW",
    check_in: checkIn,
    check_out: checkOut,
    guests_adults: 2,
    guest_name: "Rebecca Whitfield",
    guest_email: "r.whitfield@example.com",
    claim_ref: "CLM-1",
    total_cents: TOTAL_CENTS,
    currency: "AUD",
    payment_mode: "prepay",
    hold_expires_at: iso(2),
    decision_due_at: iso(0.2),
    submitted_at: iso(-0.1),
    ...rest,
  });
  if (!["DECLINED", "CANCELLED", "EXPIRED", "CONFIRMED", "COMPLETED"].includes(String(row.status)))
    world.db.insertRow("inventory_holds", {
      listing_id: row.listing_id,
      booking_id: row.id,
      org_id: row.org_id,
      stay_range: `[${checkIn},${checkOut})`,
      hard: false,
      expires_at: row.hold_expires_at ?? iso(2),
    });
  return row as unknown as BookingRequestRow;
}

export function booking(id: string): BookingRequestRow {
  return structuredClone(world.db.find<BookingRequestRow>("booking_requests", (r) => r.id === id)!);
}

/**
 * Partner places the card hold: create the intent as the pay route would, confirm
 * it in the Payment Element, and mirror the result as the pay/return route does
 * (it re-fetches the intent from Stripe; the webhook is still the trusted signal).
 */
export async function placeHold(bookingId: string, outcome: "success" | "decline" | "3ds" | "abandon" = "success") {
  const { ensurePaymentIntent, syncPaymentIntent } = await import("@/lib/payments/intents");
  const view = await ensurePaymentIntent(booking(bookingId), "booker@acme.test");
  const pi = world.stripe.confirmCard(view.paymentIntentId, outcome);
  await syncPaymentIntent(view.paymentIntentId);
  return { paymentIntentId: view.paymentIntentId, pi };
}

export function asUser(user: "booker" | "partnerAdmin" | "ops" | "finance" | null) {
  if (!user) {
    world.claims = null;
    world.db.actor = null;
    return;
  }
  const map = {
    booker: { sub: IDS.bookerAuth, org_id: IDS.org, role: "partner_booker", email: "booker@acme.test" },
    partnerAdmin: { sub: IDS.partnerAdminAuth, org_id: IDS.org, role: "partner_admin", email: "admin@acme.test" },
    ops: { sub: IDS.opsAuth, org_id: IDS.internalOrg, role: "livluxe_ops", email: "ops@liveluxe.test" },
    finance: { sub: IDS.financeAuth, org_id: IDS.internalOrg, role: "livluxe_finance", email: "finance@liveluxe.test" },
  } as const;
  world.claims = { ...map[user] };
  world.db.actor = { auth_user_id: map[user].sub };
}

export const claimsFor = (user: "booker" | "partnerAdmin" | "ops" | "finance") => {
  asUser(user);
  return world.claims! as {
    sub: string;
    org_id: string;
    role: "partner_booker" | "partner_admin" | "livluxe_ops" | "livluxe_finance";
    email?: string;
  };
};

/** Turn Hostaway writes on against the declared test account for the current process. */
export async function enableHostawayTestWrites(on = true) {
  process.env.HOSTAWAY_ALLOW_WRITES = on ? "true" : "false";
  process.env.HOSTAWAY_WRITE_TARGET = on ? "test" : "production";
  process.env.HOSTAWAY_TEST_ACCOUNT_ID = process.env.HOSTAWAY_ACCOUNT_ID;
  const { resetEnvCacheForTests } = await import("@/lib/env");
  resetEnvCacheForTests();
}

/**
 * Module mock factories. Each test file registers them with top-level vi.mock calls
 * (which vitest hoists above the imports of the code under test):
 *
 *   vi.mock("server-only", () => ({}));
 *   vi.mock("@/lib/db/admin", () => import("./fakes/world").then((m) => m.factories.admin()));
 *   … see tests/integration/mocks.snippet.ts
 */
export const factories = {
  admin: () => ({
    adminDb: () => world.db,
    appendAudit: async (entry: Record<string, unknown>) => {
      world.db.insertRow("audit_log", {
        actor_type: entry.actorType,
        actor_id: entry.actorId ?? null,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        request_id: entry.requestId ?? null,
      });
    },
  }),
  server: () => ({
    createServerSupabase: async () => world.db,
    getSessionClaims: async () => world.claims,
  }),
  stripe: () => ({ getStripe: () => world.stripe }),
  hostaway: () => ({ hostaway: world.hostaway }),
  email: () => ({
    sendEmail: async (args: {
      to: string | string[];
      subject: string;
      idempotencyKey: string;
      tags?: Record<string, string>;
    }) => {
      if (world.captured.emails.some((e) => e.idempotencyKey === args.idempotencyKey)) return { id: "dup" };
      world.captured.emails.push({
        to: args.to,
        subject: args.subject,
        idempotencyKey: args.idempotencyKey,
        tags: args.tags,
      });
      return { id: `email_${world.captured.emails.length}` };
    },
  }),
  slack: () => ({
    slack: async (channel: string, text: string) => {
      world.captured.slack.push({ channel, text });
    },
    alertCritical: async (condition: string, details?: Record<string, unknown>) => {
      world.captured.critical.push({ condition, details });
      world.captured.slack.push({ channel: "alerts", text: `CRITICAL ${condition}` });
    },
  }),
  logger: () => {
    const noop = () => {};
    return { log: { debug: noop, info: noop, warn: noop, error: noop, critical: noop }, redact: (v: unknown) => v };
  },
};

export const emailsOfType = (type: string) => world.captured.emails.filter((e) => e.tags?.type === type);
export const slackContaining = (s: string) => world.captured.slack.filter((m) => m.text.includes(s));
export const criticalContaining = (s: string) => world.captured.critical.filter((c) => c.condition.includes(s));
