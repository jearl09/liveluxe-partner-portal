/**
 * POST /api/webhooks/hostaway/{WEBHOOK_PATH_SECRET} — spec §6.5.
 *  - Authenticity: HTTP Basic (long random user/pass) + unguessable path segment,
 *    both compared in constant time. There is NO cryptographic signature, so the
 *    payload is a HINT only — the drain re-fetches the reservation from the API.
 *  - Persist raw body, return 200 within ~1 s. Unknown event types are 200-acknowledged.
 *  - Idempotent on hash(event_type, object_id, payload_digest).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { adminDb } from "@/lib/db/admin";
import { withApi, ok, fail } from "@/lib/api/response";
import { HostawayWebhookBody } from "@/lib/hostaway/types";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ secret: string }> };

function safeEq(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const POST = withApi<Ctx>("/api/webhooks/hostaway/[secret]", async (req, ctx, { requestId }) => {
  const e = env();
  const { secret } = await ctx.params;
  if (!safeEq(secret, e.HOSTAWAY_WEBHOOK_PATH_SECRET)) return fail("UNAUTHENTICATED", requestId);

  const auth = req.headers.get("authorization") ?? "";
  const expected =
    "Basic " + Buffer.from(`${e.HOSTAWAY_WEBHOOK_USER}:${e.HOSTAWAY_WEBHOOK_PASSWORD}`).toString("base64");
  if (!safeEq(auth, expected)) return fail("UNAUTHENTICATED", requestId);

  const raw = await req.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* keep null; still acknowledge to avoid retry storms */
  }
  const hint = HostawayWebhookBody.safeParse(json);
  const eventType = hint.success ? (hint.data.event ?? hint.data.object ?? "unknown") : "unparseable";
  const objectId = hint.success ? (hint.data.reservationId ?? hint.data.data?.id ?? "") : "";
  const digest = createHash("sha256").update(raw).digest("hex");
  const externalId = `${eventType}:${objectId}:${digest.slice(0, 16)}`;

  const { error } = await adminDb()
    .from("webhook_events")
    .insert({
      source: "hostaway",
      event_type: eventType,
      external_id: externalId,
      payload: (json ?? { raw }) as never,
      state: "received",
    });
  if (error && error.code !== "23505") {
    log.error("hostaway.webhook.persist_failed", { requestId, error: error.message });
    return fail("INTERNAL", requestId);
  }
  if (eventType === "unknown" || eventType === "unparseable") {
    log.warn("hostaway.webhook.unrecognised", { requestId, eventType });
  }
  return ok({ received: true }, { requestId });
});
