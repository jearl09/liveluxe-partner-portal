/**
 * Hostaway Public API v1 payload shapes — spec §6.3 / §6.6.
 *
 * VERIFY BEFORE BUILDING: Hostaway ships no sandbox and its API drifts. Every
 * field below must be re-verified against https://api.hostaway.com/documentation
 * and a live test-account response. Parsing is defensive (Zod, .passthrough()) so
 * a changed field quarantines one listing rather than breaking the whole sync (§17.3).
 */
import { z } from "zod";

/** Most endpoints wrap payloads as { status: "success", result: … }. A non-success status is an error even on HTTP 200. */
export const HostawayEnvelope = <T extends z.ZodTypeAny>(result: T) =>
  z.object({ status: z.string(), result: result.optional(), message: z.string().optional() }).passthrough();

export const HostawayTokenResponse = z.object({
  token_type: z.literal("Bearer"),
  expires_in: z.number().int(),
  access_token: z.string().min(10),
});
export type HostawayTokenResponse = z.infer<typeof HostawayTokenResponse>;

export const HostawayListingImage = z
  .object({
    id: z.number().optional(),
    url: z.string().url(),
    caption: z.string().nullable().optional(),
    sortOrder: z.number().nullable().optional(),
  })
  .passthrough();

export const HostawayListing = z
  .object({
    id: z.number().int(),
    listingMapId: z.number().int().nullable().optional(),
    name: z.string(),
    internalListingName: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    houseRules: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    zipcode: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    timeZoneName: z.string().nullable().optional(),
    bedroomsNumber: z.number().nullable().optional(),
    bathroomsNumber: z.number().nullable().optional(),
    bedsNumber: z.number().nullable().optional(),
    personCapacity: z.number().nullable().optional(),
    maxChildrenAllowed: z.number().nullable().optional(),
    maxInfantsAllowed: z.number().nullable().optional(),
    maxPetsAllowed: z.number().nullable().optional(),
    propertyTypeId: z.number().nullable().optional(),
    roomType: z.string().nullable().optional(),
    bathroomType: z.string().nullable().optional(),
    squareMeters: z.number().nullable().optional(),
    price: z.number().nullable().optional(),
    currencyCode: z.string().nullable().optional(),
    cleaningFee: z.number().nullable().optional(),
    priceForExtraPerson: z.number().nullable().optional(),
    guestsIncluded: z.number().nullable().optional(),
    securityDepositFee: z.number().nullable().optional(),
    weeklyDiscount: z.number().nullable().optional(),
    monthlyDiscount: z.number().nullable().optional(),
    minNights: z.number().nullable().optional(),
    maxNights: z.number().nullable().optional(),
    checkInTimeStart: z.number().nullable().optional(),
    checkInTimeEnd: z.number().nullable().optional(),
    checkOutTime: z.number().nullable().optional(),
    // SENSITIVE — routed to listing_access_details, encrypted, never logged.
    doorSecurityCode: z.string().nullable().optional(),
    doorSecurityCodeInstructions: z.string().nullable().optional(),
    checkInInstructions: z.string().nullable().optional(),
    specialInstruction: z.string().nullable().optional(),
    wifiUsername: z.string().nullable().optional(),
    wifiPassword: z.string().nullable().optional(),
    listingImages: z.array(HostawayListingImage).optional(),
    listingAmenities: z.array(z.object({ amenityId: z.number() }).passthrough()).optional(),
    listingBedTypes: z
      .array(
        z
          .object({ bedTypeId: z.number(), quantity: z.number().optional(), bedroomNumber: z.number().optional() })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type HostawayListing = z.infer<typeof HostawayListing>;

export const HostawayCalendarDay = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.string(),
    isAvailable: z.union([z.boolean(), z.number()]).nullable().optional(),
    allotment: z.number().int().nullable().optional(),
    price: z.number().nullable().optional(),
    minimumStay: z.number().int().nullable().optional(),
    closedOnArrival: z.union([z.boolean(), z.number()]).nullable().optional(),
    closedOnDeparture: z.union([z.boolean(), z.number()]).nullable().optional(),
    reservations: z
      .array(z.object({ id: z.number(), channelId: z.number().nullable().optional() }).passthrough())
      .optional(),
  })
  .passthrough();
export type HostawayCalendarDay = z.infer<typeof HostawayCalendarDay>;

export const HostawayReservation = z
  .object({
    id: z.number().int(),
    listingMapId: z.number().int(),
    channelId: z.number().int().nullable().optional(),
    status: z.string(),
    arrivalDate: z.string(),
    departureDate: z.string(),
    guestName: z.string().nullable().optional(),
    numberOfGuests: z.number().nullable().optional(),
    totalPrice: z.number().nullable().optional(),
    doorCode: z.string().nullable().optional(),
    customFieldValues: z
      .array(z.object({ customFieldId: z.number(), value: z.string().nullable() }).passthrough())
      .optional(),
  })
  .passthrough();
export type HostawayReservation = z.infer<typeof HostawayReservation>;

export interface CreateReservationPayload {
  listingMapId: number;
  channelId: number;
  arrivalDate: string;
  departureDate: string;
  guestFirstName: string;
  guestLastName: string;
  guestEmail?: string;
  phone?: string;
  numberOfGuests: number;
  totalPrice: number; // major units, per Hostaway
  currency: string;
  customFieldValues?: { customFieldId: number; value: string }[];
}

/** Unified webhook body — treated as a HINT only; always re-fetch (§6.5). */
export const HostawayWebhookBody = z
  .object({
    event: z.string().optional(),
    object: z.string().optional(),
    reservationId: z.number().optional(),
    listingMapId: z.number().optional(),
    data: z.object({ id: z.number().optional(), listingMapId: z.number().optional() }).passthrough().optional(),
  })
  .passthrough();

export type HostawayResult<T> =
  | { ok: true; data: T; status: number }
  | {
      ok: false;
      status: number;
      code:
        | "RATE_LIMITED"
        | "UNAUTHORIZED"
        | "SERVER_ERROR"
        | "TIMEOUT"
        | "ENVELOPE_FAIL"
        | "PARSE_FAIL"
        | "CIRCUIT_OPEN"
        | "WRITES_DISABLED";
      message: string;
    };
