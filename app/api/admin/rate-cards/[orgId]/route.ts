/**
 * POST /api/admin/rate-cards/{orgId} — publish a new rate-card version (spec §9, §13.4).
 * Form post from /admin/rate-cards/{orgId}; validation errors redirect back with the
 * typed values so nothing is lost. Finance and admin only (rate_cards.manage).
 */
import { requestId } from "@/lib/api/response";
import { formFields, redirectTo } from "@/lib/auth/request";
import { getSessionClaims } from "@/lib/db/server";
import { addDays, todayIn } from "@/lib/domain/dates";
import { isDomainError } from "@/lib/domain/errors";
import { can } from "@/lib/domain/permissions";
import { parseRateCardForm } from "@/lib/domain/rate-cards";
import { log } from "@/lib/observability/logger";
import { publishRateCard } from "@/lib/rate-cards/load";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ orgId: string }> };
const FIELDS = [
  "name",
  "discountPct",
  "validFrom",
  "validTo",
  "losTiers",
  "cleaningFeeFromNights",
  "waiveSecurityDeposit",
  "lastDay",
] as const;

export async function POST(req: Request, ctx: Ctx) {
  const reqId = requestId(req);
  const { orgId } = await ctx.params;
  const back = `/admin/rate-cards/${orgId}`;
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: back });
  if (!can(claims.role, "rate_cards.manage")) return redirectTo(req, back, { error: "FORBIDDEN" });

  const f = await formFields(req, FIELDS);
  // The form asks for the last day in force (inclusive); the range end is exclusive.
  const lastDay = /^\d{4}-\d{2}-\d{2}$/.test(f.lastDay) ? f.lastDay : "";
  const parsed = parseRateCardForm(
    { ...f, validTo: lastDay ? addDays(lastDay, 1) : f.validTo },
    todayIn("Australia/Melbourne"),
  );
  if (!parsed.ok) {
    return redirectTo(req, back, {
      ...f,
      error: "VALIDATION_FAILED",
      fields: Object.keys(parsed.errors).join(","),
      detail: Object.values(parsed.errors).flat()[0],
    });
  }

  try {
    const row = await publishRateCard(orgId, parsed.values);
    log.info("rate_card.published", { requestId: reqId, userId: claims.sub, orgId, version: row.version });
    return redirectTo(req, back, { done: "rate_card_published" });
  } catch (e) {
    if (isDomainError(e)) {
      const detail = typeof e.details?.detail === "string" ? e.details.detail : undefined;
      return redirectTo(req, back, { ...f, error: e.code, detail: DETAIL[detail ?? ""] ?? detail });
    }
    log.error("rate_card.publish_unhandled", { requestId: reqId, error: e instanceof Error ? e.stack : String(e) });
    return redirectTo(req, back, { ...f, error: "INTERNAL", ref: reqId });
  }
}

const DETAIL: Record<string, string> = {
  later_card_exists: "A card already starts on or after that date. Choose a later start, or start from today.",
  valid_to_before_valid_from: "End date must be after the start date.",
  discount_out_of_range: "Discount must be between 0 and 100 percent.",
};
