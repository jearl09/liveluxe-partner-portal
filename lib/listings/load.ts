/**
 * Listing and search loaders for the partner portal (spec §13.2, §15.1).
 * Runs on the RLS client: partners only ever see active, partner-visible listings
 * because the listings_select policy says so, not because this file filters.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { ListingRow } from "@/lib/db/types";
import type { CalendarDay } from "@/lib/domain/availability";
import {
  SEARCH_PAGE_SIZE,
  pageCount,
  summariseNightlyPrices,
  type PriceSummary,
  type SearchQuery,
} from "@/lib/domain/search";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!UUID.test(id)) return null;
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

  if (term) query = query.or(`suburb.ilike.%${term}%,postcode.ilike.%${term}%,public_name.ilike.%${term}%`);
  if (q.bedrooms) query = query.gte("bedrooms", q.bedrooms);
  query = query.order("suburb", { ascending: true, nullsFirst: false }).order("public_name").range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(`search failed: ${error.message}`);
  const rows = (data ?? []) as ListingRow[];
  const ids = rows.map((r) => r.id);
  const total = count ?? rows.length;

  const [images, calendar] = await Promise.all([
    ids.length
      ? supabase.from("listing_images").select("listing_id, url, sort_order").in("listing_id", ids).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    ids.length && hasDates && q.checkIn && q.checkOut
      ? supabase
          .from("calendar_days")
          .select("listing_id, price_cents")
          .in("listing_id", ids)
          .gte("date", q.checkIn)
          .lt("date", q.checkOut)
          .range(0, 9999)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (images.error) throw new Error(`listing_images read failed: ${images.error.message}`);
  if (calendar.error) throw new Error(`calendar_days read failed: ${calendar.error.message}`);

  const firstImage = new Map<string, string>();
  for (const img of images.data ?? []) if (!firstImage.has(img.listing_id)) firstImage.set(img.listing_id, img.url);

  const pricesByListing = new Map<string, { priceCents: number | null }[]>();
  for (const d of calendar.data ?? []) {
    const arr = pricesByListing.get(d.listing_id) ?? [];
    arr.push({ priceCents: d.price_cents });
    pricesByListing.set(d.listing_id, arr);
  }

  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.public_name,
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
    })),
    total,
    page: q.page,
    pages: pageCount(total),
  };
}
