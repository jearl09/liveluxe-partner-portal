/**
 * POST /api/requests/{id}/cancel — partner withdraws, cancels, or asks to cancel
 * (spec §10.3). action=cancel (self-service, before the cut-off) | request_cancel.
 * The server recomputes the policy; the form only carries the reason.
 */
import { requestId } from "@/lib/api/response";
import { formFields, redirectTo } from "@/lib/auth/request";
import { getSessionClaims } from "@/lib/db/server";
import { CANCELLATION_REASONS, type CancellationReason } from "@/lib/domain/cancellation";
import { isDomainError } from "@/lib/domain/errors";
import { log } from "@/lib/observability/logger";
import { cancelBooking, requestCancellation } from "@/lib/requests/cancel";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const reqId = requestId(req);
  const { id } = await ctx.params;
  const back = `/requests/${id}`;
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: back });
  const f = await formFields(req, ["action", "reason", "notes"] as const);
  const reason = (CANCELLATION_REASONS as readonly string[]).includes(f.reason)
    ? (f.reason as CancellationReason)
    : "other";
  try {
    if (f.action === "request_cancel") {
      await requestCancellation(claims, id, { reason, note: f.notes.slice(0, 500) }, reqId);
      return redirectTo(req, back, { done: "cancellation_requested" });
    }
    if (f.action !== "cancel") return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: "unknown action" });
    const out = await cancelBooking(claims, id, { reason, note: f.notes.slice(0, 500) }, reqId);
    return redirectTo(req, back, {
      done: out.refundCents > 0 || out.retainedCents > 0 ? "cancelled" : "withdrawn",
      detail: out.note,
    });
  } catch (e) {
    if (isDomainError(e)) return redirectTo(req, back, { error: e.code });
    log.error("booking.cancel_unhandled", { requestId: reqId, id, error: e instanceof Error ? e.stack : String(e) });
    return redirectTo(req, back, { error: "INTERNAL", ref: reqId });
  }
}
