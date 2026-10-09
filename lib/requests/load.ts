/**
 * Read models for booking requests (partner pages and the ops console).
 * RLS scopes everything: a partner sees their org's rows, Live Luxe sees all.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingRequestRow } from "@/lib/db/types";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import type { QuoteLine } from "@/lib/domain/quote-engine";
import { QUEUE_STATUSES, requestBucket, slaBand, type SlaBand } from "@/lib/domain/requests";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RequestListItem {
  id: string;
  reference: string;
  status: BookingStatus;
  orgId: string;
  orgName: string | null;
  propertyName: string;
  suburb: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string | null;
  claimRef: string | null;
  poNumber: string | null;
  totalCents: number | null;
  currency: string;
  submittedAt: string | null;
  decisionDueAt: string | null;
  holdExpiresAt: string | null;
  slaPaused: boolean;
  band: SlaBand;
  updatedAt: string;
}

export interface QuoteView {
  id: string;
  lines: QuoteLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  currency: string;
  expiresAt: string;
  priceHash: string;
}

export interface HistoryEntry {
  id: number;
  from: BookingStatus | null;
  to: BookingStatus;
  actorType: "partner" | "livluxe" | "system";
  actorName: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  at: string;
}

export interface RequestDetail {
  request: BookingRequestRow;
  org: { id: string; name: string } | null;
  listing: {
    id: string;
    name: string;
    suburb: string | null;
    state: string | null;
    postcode: string | null;
    hostawayListingId: number;
    imageUrl: string | null;
    minNights: number;
    maxNights: number | null;
    maxGuests: number | null;
    maxPets: number;
  };
  quote: QuoteView | null;
  history: HistoryEntry[];
  createdByName: string | null;
  assignedToName: string | null;
  band: SlaBand;
}

function toItem(
  r: BookingRequestRow,
  listing: { public_name: string; suburb: string | null } | undefined,
  orgName: string | null,
  now: Date,
): RequestListItem {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    orgId: r.org_id,
    orgName,
    propertyName: listing?.public_name ?? "Property",
    suburb: listing?.suburb ?? null,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: r.nights,
    guestName: r.guest_name,
    claimRef: r.claim_ref,
    poNumber: r.po_number,
    totalCents: r.total_cents,
    currency: r.currency,
    submittedAt: r.submitted_at,
    decisionDueAt: r.decision_due_at,
    holdExpiresAt: r.hold_expires_at,
    slaPaused: r.sla_paused_at !== null,
    band: slaBand(r.submitted_at, r.decision_due_at, now, { paused: r.sla_paused_at !== null }),
    updatedAt: r.updated_at,
  };
}

async function decorate(rows: BookingRequestRow[], now: Date): Promise<RequestListItem[]> {
  const supabase = await createServerSupabase();
  const listingIds = [...new Set(rows.map((r) => r.listing_id))];
  const orgIds = [...new Set(rows.map((r) => r.org_id))];
  const [listings, orgs] = await Promise.all([
    listingIds.length ? supabase.from("listings").select("id, public_name, suburb").in("id", listingIds) : { data: [] },
    orgIds.length ? supabase.from("partner_orgs").select("id, name").in("id", orgIds) : { data: [] },
  ]);
  const byListing = new Map((listings.data ?? []).map((l) => [l.id, l]));
  const byOrg = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));
  return rows.map((r) => toItem(r, byListing.get(r.listing_id), byOrg.get(r.org_id) ?? null, now));
}

/** Partner list, grouped by bucket. RLS limits it to the caller's org. */
export async function listRequests(opts: { bucket?: "open" | "upcoming" | "history"; limit?: number } = {}) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("booking_requests")
    .select("*")
    .neq("status", "DRAFT")
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  const rows = (data ?? []).filter((r) => !opts.bucket || requestBucket(r.status) === opts.bucket);
  return decorate(rows, new Date());
}

/** Ops queue: waiting on Live Luxe, most urgent first (§13.4). */
export async function listQueue() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("booking_requests")
    .select("*")
    .in("status", [...QUEUE_STATUSES])
    .order("decision_due_at", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(`queue read failed: ${error.message}`);
  return decorate(data ?? [], new Date());
}

/** Ops: every request, optionally by status. */
export async function listAllRequests(opts: { status?: BookingStatus | "all"; limit?: number } = {}) {
  const supabase = await createServerSupabase();
  let q = supabase
    .from("booking_requests")
    .select("*")
    .neq("status", "DRAFT")
    .order("updated_at", { ascending: false });
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  const { data, error } = await q.limit(opts.limit ?? 300);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  return decorate(data ?? [], new Date());
}

export async function getRequest(id: string): Promise<RequestDetail | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createServerSupabase();
  const { data: r, error } = await supabase.from("booking_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  if (!r) return null;

  const actorIds = [r.created_by, r.assigned_to].filter((x): x is string => !!x);
  const [listing, org, quote, history, image] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, public_name, suburb, state, postcode, hostaway_listing_id, min_nights, max_nights, max_guests, max_pets",
      )
      .eq("id", r.listing_id)
      .maybeSingle(),
    supabase.from("partner_orgs").select("id, name").eq("id", r.org_id).maybeSingle(),
    r.quote_id
      ? supabase.from("quotes").select("*").eq("id", r.quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("booking_status_history").select("*").eq("booking_id", id).order("occurred_at", { ascending: true }),
    supabase
      .from("listing_images")
      .select("url")
      .eq("listing_id", r.listing_id)
      .order("sort_order")
      .limit(1)
      .maybeSingle(),
  ]);
  if (!listing.data) throw new Error("listing missing for request");

  const historyActorIds = (history.data ?? []).map((h) => h.actor_id).filter((x): x is string => !!x);
  const ids = [...new Set([...actorIds, ...historyActorIds])];
  const { data: users } = ids.length
    ? await supabase.from("partner_users").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameOf = (uid: string | null) => (uid ? ((users ?? []).find((u) => u.id === uid)?.full_name ?? null) : null);

  const q = quote.data;
  return {
    request: r,
    org: org.data ?? null,
    listing: {
      id: listing.data.id,
      name: listing.data.public_name,
      suburb: listing.data.suburb,
      state: listing.data.state,
      postcode: listing.data.postcode,
      hostawayListingId: listing.data.hostaway_listing_id,
      imageUrl: image.data?.url ?? null,
      minNights: listing.data.min_nights,
      maxNights: listing.data.max_nights,
      maxGuests: listing.data.max_guests,
      maxPets: listing.data.max_pets,
    },
    quote: q
      ? {
          id: q.id,
          lines: (q.line_items as unknown as QuoteLine[]) ?? [],
          subtotalCents: q.subtotal_cents,
          taxCents: q.tax_cents,
          totalCents: q.total_cents,
          depositCents: q.deposit_cents,
          currency: q.currency,
          expiresAt: q.expires_at,
          priceHash: q.price_hash,
        }
      : null,
    history: (history.data ?? []).map((h) => ({
      id: h.id,
      from: h.from_status,
      to: h.to_status,
      actorType: h.actor_type,
      actorName: h.actor_type === "system" ? null : nameOf(h.actor_id),
      reason: h.reason,
      metadata: (h.metadata as Record<string, unknown> | null) ?? null,
      at: h.occurred_at,
    })),
    createdByName: nameOf(r.created_by),
    assignedToName: nameOf(r.assigned_to),
    band: slaBand(r.submitted_at, r.decision_due_at, new Date(), { paused: r.sla_paused_at !== null }),
  };
}
