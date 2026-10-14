/**
 * POST /api/requests/{id}/modify — partner asks to change a confirmed stay (spec §10.6).
 * action=extend (newCheckOut after the current one) | early_departure (before it).
 * The server quotes only the changed nights; the form carries dates and a reason.
 */
import { requestId } from "@/lib/api/response";
import { formFields, redirectTo } from "@/lib/auth/request";
import { getSessionClaims } from "@/lib/db/server";
import { isDomainError } from "@/lib/domain/errors";
import { log } from "@/lib/observability/logger";
import { requestEarlyDeparture, requestExtension } from "@/lib/requests/modifications";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const reqId = requestId(req);
  const { id } = await ctx.params;
  const back = `/requests/${id}`;
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: back });
  const f = await formFields(req, ["action", "newCheckOut", "reason"] as const);
  try {
    if (f.action === "extend") {
      await requestExtension(claims, id, { newCheckOut: f.newCheckOut, reason: f.reason }, reqId);
      return redirectTo(req, back, { done: "extension_requested" });
    }
    if (f.action === "early_departure") {
      await requestEarlyDeparture(claims, id, { newCheckOut: f.newCheckOut, reason: f.reason }, reqId);
      return redirectTo(req, back, { done: "early_departure_requested" });
    }
    return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: "unknown action" });
  } catch (e) {
    if (isDomainError(e))
      return redirectTo(req, back, {
        error: e.code,
        detail: typeof e.details?.detail === "string" ? e.details.detail : undefined,
      });
    log.error("booking.modify_unhandled", { requestId: reqId, id, error: e instanceof Error ? e.stack : String(e) });
    return redirectTo(req, back, { error: "INTERNAL", ref: reqId });
  }
}
