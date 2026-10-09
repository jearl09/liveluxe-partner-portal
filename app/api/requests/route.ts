/**
 * POST /api/requests — submit a booking request from the /requests/new form (spec §7.1, §16.2).
 * Form post → validation → atomic submit → redirect to the new request. Failures
 * redirect back to the form with the error code so nothing typed is lost.
 */
import { requestId } from "@/lib/api/response";
import { formFields, redirectTo } from "@/lib/auth/request";
import { getSessionClaims } from "@/lib/db/server";
import { isDomainError } from "@/lib/domain/errors";
import { can } from "@/lib/domain/permissions";
import { parseSearchParams } from "@/lib/domain/search";
import { log } from "@/lib/observability/logger";
import { submitRequest } from "@/lib/requests/submit";

export const runtime = "nodejs";

const FIELDS = [
  "listingId",
  "checkIn",
  "checkOut",
  "adults",
  "children",
  "pets",
  "priceHash",
  "guestName",
  "guestEmail",
  "guestPhone",
  "claimRef",
  "poNumber",
  "costCentre",
  "notes",
  "acceptTerms",
] as const;

export async function POST(req: Request) {
  const reqId = requestId(req);
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: "/search" });
  if (!can(claims.role, "requests.submit")) return redirectTo(req, "/requests", { error: "FORBIDDEN" });

  const f = await formFields(req, FIELDS);
  const parsed = parseSearchParams({ checkIn: f.checkIn, checkOut: f.checkOut, pets: f.pets });
  const adults = Math.min(20, Math.max(1, Number.parseInt(f.adults, 10) || 1));
  const children = Math.min(20, Math.max(0, Number.parseInt(f.children, 10) || 0));

  // Everything the form page needs to re-render itself, minus the terms checkbox.
  const back = {
    listingId: f.listingId,
    checkIn: f.checkIn,
    checkOut: f.checkOut,
    adults: String(adults),
    children: String(children),
    pets: String(parsed.query.pets),
    guestName: f.guestName,
    guestEmail: f.guestEmail,
    guestPhone: f.guestPhone,
    claimRef: f.claimRef,
    poNumber: f.poNumber,
    costCentre: f.costCentre,
    notes: f.notes.slice(0, 500),
  };

  if (!parsed.hasDates || !f.listingId)
    return redirectTo(req, "/requests/new", { ...back, error: "VALIDATION_FAILED" });

  try {
    const result = await submitRequest(
      claims,
      {
        listingId: f.listingId,
        stay: {
          checkIn: parsed.query.checkIn!,
          checkOut: parsed.query.checkOut!,
          adults,
          children,
          pets: parsed.query.pets,
        },
        priceHash: f.priceHash || null,
        form: f,
      },
      reqId,
    );
    return redirectTo(req, `/requests/${result.id}`, { submitted: "1" });
  } catch (e) {
    if (isDomainError(e)) {
      const fields = e.details?.fields as Record<string, string> | undefined;
      return redirectTo(req, "/requests/new", {
        ...back,
        error: e.code,
        fields: fields ? Object.keys(fields).join(",") : undefined,
        detail: typeof e.details?.detail === "string" ? e.details.detail : undefined,
      });
    }
    log.error("booking.submit_unhandled", { requestId: reqId, error: e instanceof Error ? e.stack : String(e) });
    return redirectTo(req, "/requests/new", { ...back, error: "INTERNAL", ref: reqId });
  }
}
