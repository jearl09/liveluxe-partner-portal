/**
 * Typed wrappers over the endpoints the platform consumes — spec §6.3.
 * All go through hostawayFetch (governor, retries, breaker, envelope unwrap).
 */
import { z } from "zod";
import { hostawayFetch } from "./client";
import { HostawayListing, HostawayCalendarDay, HostawayReservation, type CreateReservationPayload } from "./types";

export const hostaway = {
  listListings: (limit = 100, offset = 0) =>
    hostawayFetch(`/listings?limit=${limit}&offset=${offset}`, z.array(HostawayListing), { priority: "bulk" }),

  getListing: (id: number, priority: "interactive" | "bulk" = "bulk") =>
    hostawayFetch(`/listings/${id}`, HostawayListing, { priority }),

  getCalendar: (listingId: number, startDate: string, endDate: string, priority: "interactive" | "bulk" = "bulk") =>
    hostawayFetch(
      `/listings/${listingId}/calendar?startDate=${startDate}&endDate=${endDate}&includeResources=1`,
      z.array(HostawayCalendarDay),
      { priority },
    ),

  getReservation: (id: number) =>
    hostawayFetch(`/reservations/${id}`, HostawayReservation, { priority: "interactive" }),

  /** Reconciliation + "did my write land?" query after an ambiguous timeout (§6.7). */
  listReservations: (params: {
    listingId?: number;
    arrivalStartDate?: string;
    arrivalEndDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
    return hostawayFetch(`/reservations?${qs}`, z.array(HostawayReservation), { priority: "bulk" });
  },

  /** HIGHEST-RISK CALL. Caller must have (1) re-checked availability live, (2) stored the idempotency key on the booking row. */
  createReservation: (payload: CreateReservationPayload, idempotencyKey: string) =>
    hostawayFetch(`/reservations`, HostawayReservation, {
      method: "POST",
      body: payload,
      idempotencyKey,
      priority: "interactive",
    }),

  updateReservation: (
    id: number,
    patch: Partial<CreateReservationPayload> & { status?: string },
    idempotencyKey: string,
  ) =>
    hostawayFetch(`/reservations/${id}`, HostawayReservation, {
      method: "PUT",
      body: patch,
      idempotencyKey,
      priority: "interactive",
    }),

  amenities: () => hostawayFetch(`/amenities`, z.array(z.object({ id: z.number(), name: z.string() }).passthrough())),
  bedTypes: () => hostawayFetch(`/bedTypes`, z.array(z.object({ id: z.number(), name: z.string() }).passthrough())),
};
