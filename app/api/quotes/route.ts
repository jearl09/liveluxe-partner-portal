/**
 * POST /api/quotes — price a stay and return a quote (spec §9, §16.2).
 *
 * Reference Route Handler pattern: auth → Zod validation → permission check →
 * domain call → respond. Pricing comes from lib/listings/price so the API and the
 * listing page can never disagree.
 */
import { z } from "zod";
import { withApi, ok, fail, parseBody } from "@/lib/api/response";
import { getSessionClaims } from "@/lib/db/server";
import { can } from "@/lib/domain/permissions";
import { assertAvailable } from "@/lib/domain/availability";
import { DomainError } from "@/lib/domain/errors";
import { priceStay } from "@/lib/listings/price";

export const runtime = "nodejs";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const QuoteRequest = z
  .object({
    listingId: z.string().uuid(),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.number().int().min(1).max(20),
    children: z.number().int().min(0).max(20).default(0),
    pets: z.number().int().min(0).max(5).default(0),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: "checkOut must be after checkIn", path: ["checkOut"] });

export const POST = withApi<unknown>("/api/quotes", async (req, _ctx, { requestId }) => {
  const claims = await getSessionClaims();
  if (!claims) return fail("UNAUTHENTICATED", requestId);
  if (!can(claims.role, "quotes.create")) return fail("FORBIDDEN", requestId);

  const input = await parseBody(req, QuoteRequest);

  const priced = await priceStay(input.listingId, input);
  if (!priced) return fail("NOT_FOUND", requestId, { listingId: input.listingId });

  assertAvailable(priced.availability, input.listingId);
  if (!priced.quote) {
    throw new DomainError("VALIDATION_FAILED", {
      reason: "price_on_application",
      unpricedDates: priced.availability.unpricedDates,
    });
  }

  // TODO(week-2): insert into quotes (immutable), expires_at = now() + quote.validity_hours.
  return ok({ quote: priced.quote, expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString() }, { requestId });
});
