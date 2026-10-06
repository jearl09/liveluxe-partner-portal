/**
 * POST /api/quotes — price a stay and return a frozen quote (spec §9, §16.2).
 *
 * This is the reference implementation of the Route Handler pattern:
 *   auth → Zod validation → permission check → domain call → persist → respond.
 * The calendar/rate-card loading is stubbed with TODOs until Phase 1 lands the sync.
 */
import { z } from "zod";
import { withApi, ok, fail, parseBody } from "@/lib/api/response";
import { getSessionClaims } from "@/lib/db/server";
import { can } from "@/lib/domain/permissions";
import { buildQuote, PLACEHOLDER_TAX_RULES } from "@/lib/domain/quote-engine";
import { resolveAvailability, assertAvailable, type CalendarDay } from "@/lib/domain/availability";

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

  // TODO(phase-1): load calendar_days for [checkIn, checkOut) + listing limits via the RLS client.
  // TODO(phase-3): load the org's effective rate card for checkIn and the settings-table pricing policy.
  const days: CalendarDay[] = [];
  const limits = { minNights: 1, maxNights: null, maxGuests: 6, maxPets: 0 };

  const availability = resolveAvailability(days, limits, input);
  assertAvailable(availability, input.listingId);

  const quote = buildQuote({
    ...input,
    nightlyPricesCents: days.map((d) => d.priceCents),
    listing: {
      cleaningFeeCents: 0,
      extraPersonFeeCents: 0,
      guestsIncluded: 1,
      securityDepositCents: 0,
      weeklyDiscountPct: 0,
      monthlyDiscountPct: 0,
    },
    rateCard: null,
    policy: { midStayClean: null, taxRules: PLACEHOLDER_TAX_RULES },
  });

  // TODO(phase-3): insert into quotes (immutable), set expires_at = now() + org quote validity (default 48h).
  return ok({ quote, expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString() }, { requestId });
});
