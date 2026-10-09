/**
 * POST /api/requests/{id}/counter — partner answers a counter-offer (spec §10.1).
 * action=accept → back to UNDER_REVIEW; action=decline → CANCELLED (hold released).
 */
import { requestId } from "@/lib/api/response";
import { formFields, redirectTo } from "@/lib/auth/request";
import { getSessionClaims } from "@/lib/db/server";
import { isDomainError } from "@/lib/domain/errors";
import { log } from "@/lib/observability/logger";
import { respondToCounter } from "@/lib/requests/decide";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const reqId = requestId(req);
  const { id } = await ctx.params;
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: `/requests/${id}` });
  const { action } = await formFields(req, ["action"] as const);
  if (action !== "accept" && action !== "decline")
    return redirectTo(req, `/requests/${id}`, { error: "VALIDATION_FAILED" });
  try {
    await respondToCounter(claims, id, action === "accept");
    return redirectTo(req, `/requests/${id}`, { done: action === "accept" ? "counter_accepted" : "counter_declined" });
  } catch (e) {
    if (isDomainError(e)) return redirectTo(req, `/requests/${id}`, { error: e.code });
    log.error("booking.counter_unhandled", { requestId: reqId, error: e instanceof Error ? e.stack : String(e) });
    return redirectTo(req, `/requests/${id}`, { error: "INTERNAL", ref: reqId });
  }
}
