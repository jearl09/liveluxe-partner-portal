/**
 * GET /api/requests/{id}/pay/return — where Stripe sends the browser after the
 * Payment Element confirms (spec §11.3 "never confirm from a client redirect").
 * Nothing here trusts the query string: we re-fetch the PaymentIntent from
 * Stripe, mirror it, and only then decide what to show. The webhook remains the
 * authoritative path; this just makes the screen current immediately.
 */
import { redirectTo } from "@/lib/auth/request";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { confirmBooking } from "@/lib/payments/confirm";
import { syncPaymentIntent } from "@/lib/payments/intents";
import { log } from "@/lib/observability/logger";
import { requestId } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const reqId = requestId(req);
  const { id } = await ctx.params;
  const back = `/requests/${id}`;
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: back });

  const supabase = await createServerSupabase();
  const { data: booking } = await supabase.from("booking_requests").select("id, status").eq("id", id).maybeSingle();
  if (!booking) return redirectTo(req, "/requests", { error: "NOT_FOUND" });

  const piId = new URL(req.url).searchParams.get("payment_intent");
  if (!piId || !/^pi_[A-Za-z0-9]+$/.test(piId)) return redirectTo(req, back, { error: "VALIDATION_FAILED" });

  try {
    const synced = await syncPaymentIntent(piId);
    if (!synced || synced.row.booking_id !== id) return redirectTo(req, back, { error: "NOT_FOUND" });
    const state = synced.row.status;
    switch (state) {
      case "requires_capture":
        return redirectTo(req, back, { done: "card_held" });
      case "succeeded": {
        if (booking.status === "AWAITING_PAYMENT" || booking.status === "APPROVED") {
          const out = await confirmBooking(id, reqId, "webhook");
          return redirectTo(req, back, { done: out.status === "CONFIRMED" ? "confirmed" : "paid" });
        }
        return redirectTo(req, back, { done: "paid" });
      }
      case "requires_action":
        return redirectTo(req, `${back}/pay`, { error: "PAYMENT_REQUIRES_ACTION" });
      case "requires_payment_method":
        return redirectTo(req, `${back}/pay`, {
          error: "PAYMENT_FAILED",
          detail: synced.row.failure_message ?? undefined,
        });
      default:
        return redirectTo(req, back, { done: "payment_pending" });
    }
  } catch (e) {
    log.error("payment.return_unhandled", { requestId: reqId, id, error: e instanceof Error ? e.stack : String(e) });
    return redirectTo(req, back, { error: "INTERNAL", ref: reqId });
  }
}
