/**
 * Shared harness for the live suites: a service-role Supabase client standing in
 * for both lib/db/admin and lib/db/server (there is no browser session here),
 * captured email / Slack (nothing is sent), seeded fixtures in a disposable
 * partner org, and cleanup that leaves Stripe, Hostaway and the database as it
 * found them (reservations cancelled, holds voided, rows deleted).
 */
import { createClient } from "@supabase/supabase-js";
import type { BookingRequestRow, Database } from "@/lib/db/types";

export interface Captured {
  emails: { to: string | string[]; subject: string; idempotencyKey: string; tags?: Record<string, string> }[];
  slack: { channel: string; text: string }[];
  critical: { condition: string; details?: Record<string, unknown> }[];
}

type Claims = { sub: string; org_id: string; role: string; email?: string } | null;

export const live = {
  db: createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  claims: null as Claims,
  captured: { emails: [], slack: [], critical: [] } as Captured,
  created: {
    bookings: [] as string[],
    orgs: [] as string[],
    users: [] as string[],
    quotes: [] as string[],
    reservations: [] as number[],
  },
  resetCaptured() {
    this.captured = { emails: [], slack: [], critical: [] };
  },
};

export const factories = {
  admin: () => ({
    adminDb: () => live.db,
    appendAudit: async () => {},
  }),
  server: () => ({
    createServerSupabase: async () => live.db,
    getSessionClaims: async () => live.claims,
  }),
  email: () => ({
    sendEmail: async (args: Captured["emails"][number]) => {
      live.captured.emails.push(args);
      return { id: `live_${live.captured.emails.length}` };
    },
  }),
  slack: () => ({
    slack: async (channel: string, text: string) => {
      live.captured.slack.push({ channel, text });
    },
    alertCritical: async (condition: string, details?: Record<string, unknown>) => {
      live.captured.critical.push({ condition, details });
    },
  }),
};

export const TAG = `verify-live-${Date.now().toString(36)}`;
const uuid = () => crypto.randomUUID();
const date = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

export interface Fixture {
  orgId: string;
  bookerId: string;
  opsId: string;
  financeId: string;
  listingId: string;
  hostawayListingId: number;
}

/**
 * Seeds a disposable partner org + users and points at an existing listing row in
 * the database for the Hostaway TEST account listing named by LIVE_HOSTAWAY_LISTING_ID.
 */
export async function seedFixture(): Promise<Fixture> {
  const hostawayListingId = Number(process.env.LIVE_HOSTAWAY_LISTING_ID);
  if (!hostawayListingId)
    throw new Error(
      "set LIVE_HOSTAWAY_LISTING_ID to a listing in the Hostaway TEST account that has been synced into this database",
    );
  const { data: listing } = await live.db
    .from("listings")
    .select("id")
    .eq("hostaway_listing_id", hostawayListingId)
    .maybeSingle();
  if (!listing)
    throw new Error(
      `listing ${hostawayListingId} is not in the database yet — run sync-listings against the test account first`,
    );

  const orgId = uuid();
  const { error: oErr } = await live.db.from("partner_orgs").insert({
    id: orgId,
    name: `Verify Live ${TAG}`,
    type: "insurance",
    status: "active",
    payment_terms: "prepay",
    billing_email: `ap+${TAG}@example.com`,
    finance_contact_email: "finance@example.com",
    is_internal: false,
    email_domains: [],
  });
  if (oErr) throw new Error(`seed org: ${oErr.message}`);
  live.created.orgs.push(orgId);

  const { data: internal } = await live.db
    .from("partner_orgs")
    .select("id")
    .eq("is_internal", true)
    .limit(1)
    .maybeSingle();
  const mk = async (org: string, role: string, email: string) => {
    const id = uuid();
    const { error } = await live.db
      .from("partner_users")
      .insert({ id, auth_user_id: uuid(), org_id: org, role, email, full_name: role, status: "active" });
    if (error) throw new Error(`seed user ${role}: ${error.message}`);
    live.created.users.push(id);
    return id;
  };
  const bookerId = await mk(orgId, "partner_booker", `booker+${TAG}@example.com`);
  const opsId = await mk(internal?.id ?? orgId, "livluxe_ops", `ops+${TAG}@example.com`);
  const financeId = await mk(internal?.id ?? orgId, "livluxe_finance", `finance+${TAG}@example.com`);
  return { orgId, bookerId, opsId, financeId, listingId: listing.id, hostawayListingId };
}

export async function seedBooking(
  f: Fixture,
  patch: Partial<BookingRequestRow> & { daysToCheckIn?: number; nights?: number } = {},
): Promise<BookingRequestRow> {
  const { daysToCheckIn = 30, nights = 3, ...rest } = patch;
  const checkIn = date(daysToCheckIn);
  const checkOut = date(daysToCheckIn + nights);
  const quoteId = uuid();
  const total = nights * 25_000 + 20_000;
  const lines = [
    { kind: "accommodation", label: `Accommodation (${nights} nights)`, amountCents: nights * 25_000 },
    { kind: "cleaning_fee", label: "Cleaning fee", amountCents: 20_000 },
  ];
  const { error: qErr } = await live.db.from("quotes").insert({
    id: quoteId,
    listing_id: f.listingId,
    org_id: f.orgId,
    created_by: f.bookerId,
    check_in: checkIn,
    check_out: checkOut,
    guests_adults: 2,
    guests_children: 0,
    guests_pets: 0,
    line_items: lines as never,
    subtotal_cents: total,
    tax_cents: 0,
    total_cents: total,
    deposit_cents: 0,
    currency: "AUD",
    price_hash: TAG,
    expires_at: iso(2),
  });
  if (qErr) throw new Error(`seed quote: ${qErr.message}`);
  live.created.quotes.push(quoteId);
  const id = uuid();
  const { data, error } = await live.db
    .from("booking_requests")
    .insert({
      id,
      reference: `LLX-VERIFY-${Date.now().toString(36).toUpperCase()}`,
      org_id: f.orgId,
      listing_id: f.listingId,
      quote_id: quoteId,
      created_by: f.bookerId,
      status: "UNDER_REVIEW",
      check_in: checkIn,
      check_out: checkOut,
      guests_adults: 2,
      guest_name: "Verify Live",
      guest_email: `guest+${TAG}@example.com`,
      total_cents: total,
      currency: "AUD",
      payment_mode: "prepay",
      hold_expires_at: iso(2),
      decision_due_at: iso(0.2),
      submitted_at: new Date().toISOString(),
      ...rest,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`seed booking: ${error?.message}`);
  live.created.bookings.push(id);
  return data;
}

export async function booking(id: string): Promise<BookingRequestRow> {
  const { data } = await live.db.from("booking_requests").select("*").eq("id", id).single();
  return data!;
}

export function asUser(f: Fixture, who: "booker" | "ops" | "finance" | null) {
  if (!who) {
    live.claims = null;
    return null;
  }
  const map = {
    booker: { sub: f.bookerId, org_id: f.orgId, role: "partner_booker" },
    ops: { sub: f.opsId, org_id: f.orgId, role: "livluxe_ops" },
    finance: { sub: f.financeId, org_id: f.orgId, role: "livluxe_finance" },
  } as const;
  live.claims = { ...map[who] };
  return live.claims as { sub: string; org_id: string; role: "partner_booker" | "livluxe_ops" | "livluxe_finance" };
}

export const emailsOfType = (type: string) => live.captured.emails.filter((e) => e.tags?.type === type);
export const criticalContaining = (s: string) => live.captured.critical.filter((c) => c.condition.includes(s));

/** Leave nothing behind: Hostaway reservations cancelled, Stripe holds voided, rows deleted. */
export async function cleanup() {
  const { hostaway } = await import("@/lib/hostaway/api");
  const { getStripe } = await import("@/lib/stripe/client");
  for (const rid of live.created.reservations)
    await hostaway.cancelReservation(rid, "host", `${TAG}:cleanup:${rid}`).catch(() => null);
  for (const b of live.created.bookings) {
    const { data: payments } = await live.db
      .from("payments")
      .select("stripe_payment_intent_id, status")
      .eq("booking_id", b);
    for (const p of payments ?? [])
      if (p.status === "requires_capture" || p.status === "requires_payment_method" || p.status === "requires_action")
        await getStripe()
          .paymentIntents.cancel(p.stripe_payment_intent_id)
          .catch(() => null);
    for (const t of [
      "booking_modifications",
      "refunds",
      "disputes",
      "payments",
      "booking_status_history",
      "notifications",
      "inventory_holds",
      "checkin_access_log",
    ])
      await live.db
        .from(t as "payments")
        .delete()
        .eq("booking_id", b);
    await live.db.from("invoices").delete().eq("booking_id", b);
    await live.db.from("booking_requests").delete().eq("id", b);
  }
  for (const q of live.created.quotes) await live.db.from("quotes").delete().eq("id", q);
  for (const o of live.created.orgs) await live.db.from("invoices").delete().eq("org_id", o);
  for (const u of live.created.users) await live.db.from("partner_users").delete().eq("id", u);
  for (const o of live.created.orgs) await live.db.from("partner_orgs").delete().eq("id", o);
  await live.db.from("reconciliation_exceptions").delete().like("detail->>reference", "LLX-VERIFY-%");
  live.created = { bookings: [], orgs: [], users: [], quotes: [], reservations: [] };
}
