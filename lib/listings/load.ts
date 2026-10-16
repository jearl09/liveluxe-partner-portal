/**
 * Listing and search loaders for the partner portal (spec §13.2, §15.1).
 * Runs on the RLS client: partners only ever see active, partner-visible listings
 * because the listings_select policy says so, not because this file filters.
 */
import { partnerPropertyName } from "@/lib/domain/property-name";
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { ListingRow } from "@/lib/db/types";
import type { CalendarDay } from "@/lib/domain/availability";
import type { TakenRange } from "@/lib/domain/stay-picker";
import { log } from "@/lib/observability/logger";
import { isUuid } from "@/lib/domain/ids";
import {
  SEARCH_PAGE_SIZE,
  pageCount,
  nearbyWindows,
  sortByPrice,
  summariseNightlyPrices,
  type PriceSummary,
  type SearchQuery,
} from "@/lib/domain/search";

export interface ListingImage {
  url: string;
  caption: string | null;
  sortOrder: number;
}

export interface ListingAmenity {
  code: string;
  label: string | null;
}

export interface ListingDetail {
  listing: ListingRow;
  images: ListingImage[];
  amenities: ListingAmenity[];
}

export async function getListing(id: string): Promise<ListingDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createServerSupabase();
  const { data: listing, error } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`listing read failed: ${error.message}`);
  if (!listing) return null;

  const [images, amenities] = await Promise.all([
    supabase.from("listing_images").select("url, caption, sort_order").eq("listing_id", id).order("sort_order"),
    supabase.from("listing_amenities").select("amenity_code, label").eq("listing_id", id).order("label"),
  ]);
  if (images.error) throw new Error(`listing_images read failed: ${images.error.message}`);
  if (amenities.error) throw new Error(`listing_amenities read failed: ${amenities.error.message}`);

  return {
    listing,
    images: (images.data ?? []).map((i) => ({ url: i.url, caption: i.caption, sortOrder: i.sort_order })),
    amenities: (amenities.data ?? []).map((a) => ({ code: a.amenity_code, label: a.label })),
  };
}

/** Calendar rows for [from, to] inclusive, as domain CalendarDay values. */
export async function getCalendarDays(listingId: string, from: string, to: string): Promise<CalendarDay[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("calendar_days")
    .select("date, status, is_available, allotment, price_cents, min_stay, closed_on_arrival, closed_on_departure")
    .eq("listing_id", listingId)
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .range(0, 999);
  if (error) throw new Error(`calendar_days read failed: ${error.message}`);
  return (data ?? []).map((d) => ({
    date: d.date,
    status: d.status,
    isAvailable: d.is_available,
    allotment: d.allotment,
    priceCents: d.price_cents,
    minStay: d.min_stay,
    closedOnArrival: d.closed_on_arrival,
    closedOnDeparture: d.closed_on_departure,
  }));
}

/**
 * Holds and approved bookings on a listing that the synced calendar may not show yet (migration
 * …_listing_taken_ranges). Fails open to "none" with a warning: the quote and the submission re-check holds anyway.
 */
export async function getTakenRanges(
  listingId: string,
  from: string,
  to: string,
  exceptBookingId: string | null = null,
): Promise<TakenRange[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("listing_taken_ranges", {
    p_listing_id: listingId,
    p_from: from,
    p_to: to,
    p_except_booking: exceptBookingId,
  });
  if (error) {
    log.warn("listing.taken_ranges_failed", { listingId, message: error.message });
    return [];
  }
  return (data ?? []).map((r) => ({ start: r.start_date, end: r.end_date }));
}

export interface SearchResultItem {
  id: string;
  name: string;
  suburb: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  maxGuests: number | null;
  maxPets: number;
  minNights: number;
  basePriceCents: number | null;
  currency: string;
  imageUrl: string | null;
  /** Present only when the search had dates. */
  price: PriceSummary | null;
}

export interface SearchResults {
  items: SearchResultItem[];
  total: number;
  page: number;
  pages: number;
}

/** Characters that are safe inside a PostgREST `or=` filter value. */
const cleanTerm = (q: string) => q.replace(/[^\p{L}\p{N}\s-]/gu, "").trim();

/** PostgREST returns at most this many rows per request (Supabase `max_rows`); larger reads are split. */
const MAX_ROWS = 1000;
type Db = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * Each listing's cover photo. Reads only the lowest sort position per listing rather than every
 * photo (2,000+ rows, silently cut at MAX_ROWS), then looks up the few listings whose first photo
 * sits further down the order.
 */
async function firstImages(supabase: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const first = await supabase
    .from("listing_images")
    .select("listing_id, url")
    .in("listing_id", ids)
    .lte("sort_order", 1)
    .order("sort_order");
  if (first.error) throw new Error(`listing_images read failed: ${first.error.message}`);
  for (const img of first.data ?? []) if (!out.has(img.listing_id)) out.set(img.listing_id, img.url);
  const missing = ids.filter((id) => !out.has(id));
  for (const id of missing) {
    const one = await supabase
      .from("listing_images")
      .select("url")
      .eq("listing_id", id)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (one.error) throw new Error(`listing_images read failed: ${one.error.message}`);
    if (one.data) out.set(id, one.data.url);
  }
  return out;
}

/**
 * Nightly prices for the stay, in batches of listings small enough that no batch passes MAX_ROWS.
 * A cut-off read would leave a listing short of nights and wrongly show "Price on application".
 */
async function calendarFor(
  supabase: Db,
  ids: string[],
  checkIn: string,
  checkOut: string,
  nights: number,
): Promise<{ listing_id: string; price_cents: number | null }[]> {
  const perBatch = Math.max(1, Math.floor(MAX_ROWS / Math.max(1, nights)));
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += perBatch) batches.push(ids.slice(i, i + perBatch));
  const results = await Promise.all(
    batches.map((batch) =>
      supabase
        .from("calendar_days")
        .select("listing_id, price_cents")
        .in("listing_id", batch)
        .gte("date", checkIn)
        .lt("date", checkOut),
    ),
  );
  for (const r of results) if (r.error) throw new Error(`calendar_days read failed: ${r.error.message}`);
  return results.flatMap((r) => r.data ?? []);
}

export async function searchListings(q: SearchQuery, nights: number, hasDates: boolean): Promise<SearchResults> {
  const supabase = await createServerSupabase();
  const from = (q.page - 1) * SEARCH_PAGE_SIZE;
  const to = from + SEARCH_PAGE_SIZE - 1;
  const term = cleanTerm(q.q);

  // Either the gap-free availability function (with dates) or the plain catalogue.
  let query =
    hasDates && q.checkIn && q.checkOut
      ? supabase.rpc(
          "search_available_listings",
          { p_check_in: q.checkIn, p_check_out: q.checkOut, p_guests: q.guests, p_pets: q.pets },
          { count: "exact" },
        )
      : supabase
          .from("listings")
          .select("*", { count: "exact" })
          .eq("is_active", true)
          .eq("is_partner_visible", true)
          .gte("max_guests", q.guests)
          .gte("max_pets", q.pets);

  if (term)
    query = query.or(
      `suburb.ilike.%${term}%,postcode.ilike.%${term}%,public_name.ilike.%${term}%,internal_name.ilike.%${term}%`,
    );
  if (q.bedrooms) query = query.gte("bedrooms", q.bedrooms);
  // Price order needs every available listing's price, so it pages in memory; the
  // available set for one stay is the portfolio at most (a few hundred rows).
  const byPrice = hasDates && (q.sort === "price_asc" || q.sort === "price_desc");
  if (q.sort === "bedrooms") query = query.order("bedrooms", { ascending: false, nullsFirst: false });
  query = query.order("suburb", { ascending: true, nullsFirst: false }).order("public_name");
  query = byPrice ? query.range(0, 499) : query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(`search failed: ${error.message}`);
  const rows = (data ?? []) as ListingRow[];
  const ids = rows.map((r) => r.id);
  const total = count ?? rows.length;

  const [firstImage, calendar] = await Promise.all([
    firstImages(supabase, ids),
    ids.length && hasDates && q.checkIn && q.checkOut
      ? calendarFor(supabase, ids, q.checkIn, q.checkOut, nights)
      : Promise.resolve([]),
  ]);

  const pricesByListing = new Map<string, { priceCents: number | null }[]>();
  for (const d of calendar) {
    const arr = pricesByListing.get(d.listing_id) ?? [];
    arr.push({ priceCents: d.price_cents });
    pricesByListing.set(d.listing_id, arr);
  }

  const items: SearchResultItem[] = rows.map((r) => ({
    id: r.id,
    name: partnerPropertyName(r.public_name, (r as { internal_name?: string | null }).internal_name),
    suburb: r.suburb,
    state: r.state,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    maxGuests: r.max_guests,
    maxPets: r.max_pets,
    minNights: r.min_nights,
    basePriceCents: r.base_price_cents,
    currency: r.currency,
    imageUrl: firstImage.get(r.id) ?? null,
    price: hasDates ? summariseNightlyPrices(pricesByListing.get(r.id) ?? [], nights) : null,
  }));
  return {
    items: byPrice ? sortByPrice(items, q.sort === "price_asc" ? "asc" : "desc").slice(from, to + 1) : items,
    total,
    page: q.page,
    pages: pageCount(total),
  };
}

/**
 * Near-miss dates (brief §7.3): when nothing is free, how many properties are free
 * for the same length of stay a few days either side. Counts only; stops at three.
 */
export async function nearbyAvailability(
  q: SearchQuery,
  nights: number,
  today: string,
): Promise<{ checkIn: string; checkOut: string; shift: number; count: number }[]> {
  if (!q.checkIn) return [];
  const supabase = await createServerSupabase();
  const term = cleanTerm(q.q);
  const out: { checkIn: string; checkOut: string; shift: number; count: number }[] = [];
  for (const w of nearbyWindows(q.checkIn, nights, today)) {
    let query = supabase.rpc(
      "search_available_listings",
      { p_check_in: w.checkIn, p_check_out: w.checkOut, p_guests: q.guests, p_pets: q.pets },
      { count: "exact", head: true },
    );
    if (term)
      query = query.or(
        `suburb.ilike.%${term}%,postcode.ilike.%${term}%,public_name.ilike.%${term}%,internal_name.ilike.%${term}%`,
      );
    if (q.bedrooms) query = query.gte("bedrooms", q.bedrooms);
    const { count } = await query;
    if (count && count > 0) out.push({ ...w, count });
    if (out.length === 3) break;
  }
  return out;
}
