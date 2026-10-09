/**
 * POST /api/admin/requests/{id} — ops decisions (spec §13.4, §10.1).
 * action=review | approve | decline | counter. Form posts from /admin/bookings/{id}.
 */
import { requestId } from "@/lib/api/response";
import { formFields, redirectTo } from "@/lib/auth/request";
import { getSessionClaims } from "@/lib/db/server";
import type { DeclineReasonDb } from "@/lib/db/types";
import { DECLINE_REASON_CODES } from "@/lib/domain/booking-state-machine";
import { isDomainError } from "@/lib/domain/errors";
import { can } from "@/lib/domain/permissions";
import { validateCounterOffer } from "@/lib/domain/requests";
import { log } from "@/lib/observability/logger";
import { approve, counterOffer, decline, loadPolicy, startReview } from "@/lib/requests/decide";
import { getRequest } from "@/lib/requests/load";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const reqId = requestId(req);
  const { id } = await ctx.params;
  const back = `/admin/bookings/${id}`;
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: back });
  if (!can(claims.role, "requests.approve")) return redirectTo(req, back, { error: "FORBIDDEN" });

  const f = await formFields(req, [
    "action",
    "reason",
    "notes",
    "newTotal",
    "newCheckIn",
    "newCheckOut",
    "message",
  ] as const);

  try {
    switch (f.action) {
      case "review":
        await startReview(claims, id);
        return redirectTo(req, back, { done: "review" });
      case "approve":
        await approve(claims, id, reqId);
        return redirectTo(req, back, { done: "approved" });
      case "decline": {
        const reason = (DECLINE_REASON_CODES as readonly string[]).includes(f.reason)
          ? (f.reason as DeclineReasonDb)
          : null;
        if (!reason) return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: "decline_reason" });
        await decline(claims, id, { reason, notes: f.notes.slice(0, 1000) });
        return redirectTo(req, back, { done: "declined" });
      }
      case "counter": {
        const current = await getRequest(id);
        if (!current) return redirectTo(req, "/admin/queue", { error: "NOT_FOUND" });
        const v = validateCounterOffer(
          { newTotal: f.newTotal, newCheckIn: f.newCheckIn, newCheckOut: f.newCheckOut, message: f.message },
          {
            totalCents: current.request.total_cents,
            checkIn: current.request.check_in,
            checkOut: current.request.check_out,
          },
        );
        if (!v.ok) return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: v.errors.join(" ") });
        await counterOffer(claims, id, v.value, await loadPolicy());
        return redirectTo(req, back, { done: "countered" });
      }
      default:
        return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: "unknown action" });
    }
  } catch (e) {
    if (isDomainError(e)) {
      const detail =
        typeof e.details?.detail === "string"
          ? e.details.detail
          : Array.isArray(e.details?.conflictingDates)
            ? `Unavailable: ${(e.details.conflictingDates as string[]).slice(0, 5).join(", ")}`
            : undefined;
      return redirectTo(req, back, { error: e.code, detail });
    }
    log.error("booking.decision_unhandled", {
      requestId: reqId,
      action: f.action,
      error: e instanceof Error ? e.stack : String(e),
    });
    return redirectTo(req, back, { error: "INTERNAL", ref: reqId });
  }
}
