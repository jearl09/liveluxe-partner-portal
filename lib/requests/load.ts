/**
 * Read models for booking requests (partner pages and the ops console).
 * RLS scopes everything: a partner sees their org's rows, Live Luxe sees all.
 */
import { partnerPropertyName } from "@/lib/domain/property-name";
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingRequestRow } from "@/lib/db/types";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import type { QuoteLine } from "@/lib/domain/quote-engine";
import { BUCKET_STATUSES, slaBand, type RequestBucket, type SlaBand } from "@/lib/domain/requests";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  ilikePattern,
  pageRange,
  toPage,
  type Page,
  type PageSize,
} from "@/lib/domain/list-params";
import { isUuid } from "@/lib/domain/ids";

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
    /** Live Luxe's internal Hostaway name; carries the street the partner-facing name is taken from. */
    internalName: string | null;
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
  listing: { public_name: string; internal_name?: string | null; suburb: string | null } | undefined,
  orgName: string | null,
  now: Date,
): RequestListItem {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    orgId: r.org_id,
    orgName,
    propertyName: partnerPropertyName(listing?.public_name, listing?.internal_name),
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
    listingIds.length
      ? supabase.from("listings").select("id, public_name, internal_name, suburb").in("id", listingIds)
      : { data: [] },
    orgIds.length ? supabase.from("partner_orgs").select("id, name").in("id", orgIds) : { data: [] },
  ]);
  const byListing = new Map((listings.data ?? []).map((l) => [l.id, l]));
  const byOrg = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));
  return rows.map((r) => toItem(r, byListing.get(r.listing_id), byOrg.get(r.org_id) ?? null, now));
}

/** Reference, claim number, PO or guest-name search, applied in the database. */
export function withSearch<T extends { or: (f: string) => T }>(q: T, term: string): T {
  if (!term) return q;
  const pattern = ilikePattern(term);
  return q.or(
    `reference.ilike.${pattern},guest_name.ilike.${pattern},claim_ref.ilike.${pattern},po_number.ilike.${pattern}`,
  );
}

/**
 * Partner list, one bucket at a time, paged in the database. RLS limits it to the
 * caller's org. Sorted by last activity, then by id so a page boundary never shows a
 * row twice or skips one when two rows share a timestamp.
 */
export async function listRequests(opts: {
  bucket: RequestBucket;
  page?: number;
  pageSize?: PageSize;
}): Promise<Page<RequestListItem>> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const supabase = await createServerSupabase();
  const base = (head: boolean) =>
    supabase.from("booking_requests").select("*", { count: "exact", head }).in("status", BUCKET_STATUSES[opts.bucket]);
  // Two trips: the count fixes the page before the rows are fetched, so ?page=99 lands on the last page.
  const { count, error: countError } = await base(true);
  if (countError) throw new Error(`booking_requests count failed: ${countError.message}`);
  const total = count ?? 0;
  const page = clampPage(opts.page ?? 1, total, pageSize);
  const { from, to } = pageRange(page, pageSize);
  const { data, error } = await base(false)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  return toPage(await decorate(data ?? [], new Date()), total, page, pageSize);
}

export async function getRequest(id: string): Promise<RequestDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createServerSupabase();
  const { data: r, error } = await supabase.from("booking_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  if (!r) return null;

  const actorIds = [r.created_by, r.assigned_to].filter((x): x is string => !!x);
  const [listing, org, quote, history, image] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, public_name, internal_name, suburb, state, postcode, hostaway_listing_id, min_nights, max_nights, max_guests, max_pets",
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
      internalName: listing.data.internal_name,
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
