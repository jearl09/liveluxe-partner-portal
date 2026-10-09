/**
 * Hostaway → platform field mapping — spec §6.6.
 * This is the ONLY module that knows Hostaway's shape. Everything downstream
 * codes against the platform columns.
 */
import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import type { HostawayListing, HostawayCalendarDay } from "./types";
import type { CalendarDay, DayStatus } from "@/lib/domain/availability";

/**
 * Hostaway descriptions are host-authored HTML. Keep simple formatting only; no
 * links, images, styles or scripts. Pure JS (no jsdom) so it runs on serverless.
 */
const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h3", "h4"],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
};

const toCents = (major: number | null | undefined): number | null =>
  major === null || major === undefined ? null : Math.round(major * 100);

/**
 * Hostaway expresses check-in windows as hours and allows values past midnight
 * (e.g. checkInTimeEnd = 26 means 2 am the next day). Postgres `time` does not,
 * so wrap into 0–23; anything non-numeric or absurd becomes null.
 */
const hourToTime = (h: number | null | undefined): string | null => {
  if (h === null || h === undefined || !Number.isFinite(h)) return null;
  const whole = Math.trunc(h);
  if (whole < 0 || whole > 47) return null;
  return `${String(whole % 24).padStart(2, "0")}:00:00`;
};

const truthy = (v: boolean | number | null | undefined) => v === true || v === 1;

export interface ListingRow {
  hostaway_listing_id: number;
  hostaway_listing_map_id: number | null;
  public_name: string;
  internal_name: string | null;
  description_html: string | null;
  house_rules: string | null;
  address_line: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country_code: string;
  lat: number | null;
  lng: number | null;
  timezone: string;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  bed_config: unknown;
  max_guests: number | null;
  max_pets: number;
  property_type: string | null;
  area_sqm: number | null;
  base_price_cents: number | null;
  currency: string;
  cleaning_fee_cents: number;
  extra_person_fee_cents: number;
  guests_included: number;
  security_deposit_cents: number;
  weekly_discount_pct: number;
  monthly_discount_pct: number;
  min_nights: number;
  max_nights: number | null;
  checkin_from: string | null;
  checkin_to: string | null;
  checkout_by: string | null;
  images: { url: string; caption: string | null; sort_order: number }[];
  amenity_ids: number[];
  content_hash: string;
}

/** SENSITIVE fields, split out so ordinary listing queries never touch them. */
export interface AccessDetailsRow {
  door_code: string | null;
  access_instructions: string | null;
  checkin_instructions: string | null;
  special_instructions: string | null;
  wifi_ssid: string | null;
  wifi_password: string | null;
}

export function mapListing(src: HostawayListing): { listing: ListingRow; access: AccessDetailsRow } {
  const sanitize = (html: string | null | undefined) => (html ? sanitizeHtml(html, SANITIZE) : null);

  const listing: ListingRow = {
    hostaway_listing_id: src.id,
    hostaway_listing_map_id: src.listingMapId ?? null,
    public_name: src.name,
    internal_name: src.internalListingName ?? null,
    description_html: sanitize(src.description),
    house_rules: sanitize(src.houseRules),
    address_line: src.address ?? null,
    suburb: src.city ?? null,
    state: src.state ?? null,
    postcode: src.zipcode ?? null,
    country_code: src.countryCode ?? "AU",
    lat: src.lat ?? null,
    lng: src.lng ?? null,
    timezone: src.timeZoneName ?? "Australia/Melbourne",
    bedrooms: src.bedroomsNumber ?? null,
    bathrooms: src.bathroomsNumber ?? null, // numeric(3,1) — may be 2.5
    beds: src.bedsNumber ?? null,
    bed_config: src.listingBedTypes ?? null,
    max_guests: src.personCapacity ?? null,
    max_pets: src.maxPetsAllowed ?? 0,
    property_type: src.roomType ?? null,
    area_sqm: src.squareMeters ?? null,
    base_price_cents: toCents(src.price),
    currency: src.currencyCode ?? "AUD",
    cleaning_fee_cents: toCents(src.cleaningFee) ?? 0,
    extra_person_fee_cents: toCents(src.priceForExtraPerson) ?? 0,
    guests_included: src.guestsIncluded ?? 1,
    security_deposit_cents: toCents(src.securityDepositFee) ?? 0,
    weekly_discount_pct: src.weeklyDiscount ?? 0,
    monthly_discount_pct: src.monthlyDiscount ?? 0,
    min_nights: src.minNights ?? 1,
    max_nights: src.maxNights ?? null,
    checkin_from: hourToTime(src.checkInTimeStart),
    checkin_to: hourToTime(src.checkInTimeEnd),
    checkout_by: hourToTime(src.checkOutTime),
    images: (src.listingImages ?? []).map((img, i) => ({
      url: img.url,
      caption: img.caption ?? null,
      sort_order: img.sortOrder ?? i,
    })),
    amenity_ids: (src.listingAmenities ?? []).map((a) => a.amenityId),
    content_hash: "",
  };
  // Content hash over non-sensitive fields → upsert only changed rows (§6.4).
  listing.content_hash = createHash("sha256").update(JSON.stringify(listing)).digest("hex");

  const access: AccessDetailsRow = {
    door_code: src.doorSecurityCode ?? null,
    access_instructions: src.doorSecurityCodeInstructions ?? null,
    checkin_instructions: src.checkInInstructions ?? null,
    special_instructions: src.specialInstruction ?? null,
    wifi_ssid: src.wifiUsername ?? null,
    wifi_password: src.wifiPassword ?? null,
  };

  return { listing, access };
}

const KNOWN_STATUSES: readonly DayStatus[] = ["available", "blocked", "reserved", "pending"];

export function mapCalendarDay(src: HostawayCalendarDay): CalendarDay & { reservationRef: string | null } {
  const status: DayStatus = (KNOWN_STATUSES as readonly string[]).includes(src.status)
    ? (src.status as DayStatus)
    : "unknown";
  return {
    date: src.date,
    status,
    isAvailable: truthy(src.isAvailable),
    allotment: src.allotment ?? null,
    priceCents: toCents(src.price), // null stays null — never default
    minStay: src.minimumStay ?? null,
    closedOnArrival: truthy(src.closedOnArrival),
    closedOnDeparture: truthy(src.closedOnDeparture),
    // Store only the ID and channel; never other guests' PII (§6.6.2).
    reservationRef: src.reservations?.[0] ? `${src.reservations[0].id}:${src.reservations[0].channelId ?? ""}` : null,
  };
}
