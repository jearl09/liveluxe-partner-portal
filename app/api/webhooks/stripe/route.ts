/**
 * POST /api/webhooks/stripe — spec §11.3.
 *  - Signature verified against the RAW body (req.text(); no JSON middleware).
 *  - Persisted to webhook_events with a unique (source, external_id) → free idempotency.
 *  - Returns 200 fast; the drain-webhooks cron processes asynchronously.
 *  - A booking is never confirmed from a client redirect; this is the only trusted signal.
 */
import { getStripe } from "@/lib/stripe/client";
import { env } from "@/lib/env";
import { adminDb } from "@/lib/db/admin";
import { withApi, ok, fail } from "@/lib/api/response";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi<unknown>("/api/webhooks/stripe", async (req, _ctx, { requestId }) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return fail("UNAUTHENTICATED", requestId);

  const raw = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, env().STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    log.warn("stripe.webhook.bad_signature", { requestId, error: String(e) });
    return fail("UNAUTHENTICATED", requestId, { reason: "bad_signature" });
  }

  const { error } = await adminDb()
    .from("webhook_events")
    .insert({
      source: "stripe",
      event_type: event.type,
      external_id: event.id,
      payload: event as never,
      state: "received",
    });

  // 23505 = unique violation → replayed delivery; record-and-skip, never reprocess.
  if (error && error.code !== "23505") {
    log.error("stripe.webhook.persist_failed", { requestId, error: error.message });
    return fail("INTERNAL", requestId);
  }

  return ok({ received: true, duplicate: error?.code === "23505" }, { requestId });
});
