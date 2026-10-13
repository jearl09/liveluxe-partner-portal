/**
 * POST /api/admin/requests/{id} — ops decisions (spec §13.4, §10.1, §10.6).
 * action=review | approve | decline | counter | cancel | modification_approve |
 * modification_decline | release_checkin. Form posts from /admin/bookings/{id}.
 */
import { requestId } from "@/lib/api/response";
import { formFields, redirectTo } from "@/lib/auth/request";
import { adminDb } from "@/lib/db/admin";
import { getSessionClaims } from "@/lib/db/server";
import type { DeclineReasonDb } from "@/lib/db/types";
import { CANCELLATION_REASONS, type CancellationReason } from "@/lib/domain/cancellation";
import { DECLINE_REASON_CODES } from "@/lib/domain/booking-state-machine";
import { isDomainError } from "@/lib/domain/errors";
import { can } from "@/lib/domain/permissions";
import { validateCounterOffer } from "@/lib/domain/requests";
import { log } from "@/lib/observability/logger";
import { confirmBooking } from "@/lib/payments/confirm";
import { cancelBooking } from "@/lib/requests/cancel";
import { releaseCheckinNow } from "@/lib/requests/checkin";
import { approve, counterOffer, decline, loadPolicy, startReview } from "@/lib/requests/decide";
import { approveEarlyDeparture, approveExtension, declineModification } from "@/lib/requests/modifications";
import { notifyPartnerOfDecision } from "@/lib/requests/notify";
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
    "refundAmount",
    "modificationId",
  ] as const);

  try {
    switch (f.action) {
      case "review":
        await startReview(claims, id);
        return redirectTo(req, back, { done: "review" });
      case "approve": {
        await approve(claims, id, reqId);
        // Capture → Hostaway → CONFIRMED → invoice → email. Approval stands even if this step
        // fails; the Stripe webhook and the drain job retry it.
        try {
          const out = await confirmBooking(id, reqId, "approval");
          if (out.status === "CONFIRMED") return redirectTo(req, back, { done: "confirmed" });
          if (out.status === "AWAITING_PAYMENT") return redirectTo(req, back, { done: "approved_payment_pending" });
          if (out.status === "FAILED")
            return redirectTo(req, back, { error: "HOSTAWAY_UNAVAILABLE", detail: out.note });
          await notifyPartnerOfDecision(id, "approved", reqId);
          if (out.note.startsWith("hostaway:")) return redirectTo(req, back, { done: "approved_hostaway_pending" });
          return redirectTo(req, back, { done: "approved", detail: out.note });
        } catch (e) {
          log.error("booking.confirm_after_approve_failed", {
            requestId: reqId,
            id,
            error: e instanceof Error ? e.stack : String(e),
          });
          await notifyPartnerOfDecision(id, "approved", reqId);
          return redirectTo(req, back, {
            done: "approved",
            detail: "Confirmation step failed and will be retried; ops have been alerted.",
          });
        }
      }
      case "decline": {
        const reason = (DECLINE_REASON_CODES as readonly string[]).includes(f.reason)
          ? (f.reason as DeclineReasonDb)
          : null;
        if (!reason) return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: "decline_reason" });
        await decline(claims, id, { reason, notes: f.notes.slice(0, 1000) });
        await notifyPartnerOfDecision(id, "declined", reqId);
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
        await notifyPartnerOfDecision(id, "counter", reqId);
        return redirectTo(req, back, { done: "countered" });
      }
      case "cancel": {
        const reason = (CANCELLATION_REASONS as readonly string[]).includes(f.reason)
          ? (f.reason as CancellationReason)
          : "other";
        const override = f.refundAmount ? Math.round(Number(f.refundAmount.replace(/[^0-9.]/g, "")) * 100) : null;
        const out = await cancelBooking(
          claims,
          id,
          { reason, note: f.notes.slice(0, 500), overrideRefundCents: Number.isFinite(override) ? override : null },
          reqId,
        );
        return redirectTo(req, back, {
          done: out.refundOk ? "cancelled" : "cancelled_refund_pending",
          detail: out.note,
        });
      }
      case "modification_approve": {
        if (!f.modificationId) return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: "modification" });
        const { data: mod } = await adminDb()
          .from("booking_modifications")
          .select("kind")
          .eq("id", f.modificationId)
          .maybeSingle();
        if (!mod) return redirectTo(req, back, { error: "NOT_FOUND" });
        if (mod.kind === "extension") await approveExtension(claims, f.modificationId, f.notes, reqId);
        else {
          const override = f.refundAmount ? Math.round(Number(f.refundAmount.replace(/[^0-9.]/g, "")) * 100) : null;
          await approveEarlyDeparture(
            claims,
            f.modificationId,
            { overrideRefundCents: Number.isFinite(override) ? override : null, note: f.notes },
            reqId,
          );
        }
        return redirectTo(req, back, { done: "modification_approved" });
      }
      case "modification_decline": {
        if (!f.modificationId) return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: "modification" });
        await declineModification(claims, f.modificationId, f.notes, reqId);
        return redirectTo(req, back, { done: "modification_declined" });
      }
      case "release_checkin": {
        await releaseCheckinNow(claims, id, reqId);
        return redirectTo(req, back, { done: "checkin_released" });
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
