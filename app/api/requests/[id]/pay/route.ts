/**
 * GET /api/requests/{id}/pay — the PaymentIntent client secret for the Payment
 * Element on /requests/{id}/pay (spec §11.1 mode A). Get-or-create, idempotent.
 * The amount always comes from the booking row, never from the client.
 */
import { fail, ok, withApi } from "@/lib/api/response";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { env } from "@/lib/env";
import { DomainError } from "@/lib/domain/errors";
import { PAYABLE_STATUSES } from "@/lib/domain/payments";
import { can } from "@/lib/domain/permissions";
import { ensurePaymentIntent } from "@/lib/payments/intents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>("/api/requests/[id]/pay", async (_req, ctx, { requestId }) => {
  const claims = await getSessionClaims();
  if (!claims) return fail("UNAUTHENTICATED", requestId);
  if (!can(claims.role, "payments.authorise")) return fail("FORBIDDEN", requestId);
  const { id } = await ctx.params;

  // RLS: a partner only ever sees their own org's request.
  const supabase = await createServerSupabase();
  const { data: booking } = await supabase.from("booking_requests").select("*").eq("id", id).maybeSingle();
  if (!booking) return fail("NOT_FOUND", requestId);
  if (!(PAYABLE_STATUSES as readonly string[]).includes(booking.status))
    throw new DomainError("INVALID_STATE_TRANSITION", {
      from: booking.status,
      detail: "This request cannot be paid now.",
    });

  const intent = await ensurePaymentIntent(booking, claims.email);
  return ok(
    {
      clientSecret: intent.clientSecret,
      amountCents: intent.amountCents,
      currency: intent.currency,
      mode: intent.mode,
      state: intent.state,
      publishableKey: env().NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    },
    { requestId },
  );
});
