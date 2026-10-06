/**
 * POST /api/auth/reset-password — request a password-reset email (spec §8.2).
 * Always responds as if the email was sent, so the endpoint cannot be used to enumerate accounts.
 * The email itself is sent by Supabase Auth; its template must link to
 *   {{ .SiteURL }}/api/auth/callback?next=/reset-password/confirm  (PKCE)   — or —
 *   {{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password/confirm
 */
import { createServerSupabase } from "@/lib/db/server";
import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";
import { SENSITIVE_ACTION_RATE_LIMITS } from "@/lib/domain/auth";
import { isDomainError } from "@/lib/domain/errors";
import { accountKey, assertWithinRateLimits, ipKey } from "@/lib/auth/rate-limit";
import { clientIp, formFields, redirectTo } from "@/lib/auth/request";
import { requestId } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reqId = requestId(req);
  const { email } = await formFields(req, ["email"] as const);
  if (!email) return redirectTo(req, "/reset-password", { error: "missing" });

  try {
    await assertWithinRateLimits(
      [
        { key: accountKey("reset", email), rule: SENSITIVE_ACTION_RATE_LIMITS.perAccount },
        { key: ipKey("reset", clientIp(req)), rule: SENSITIVE_ACTION_RATE_LIMITS.perIp },
      ],
      reqId,
    );
  } catch (e) {
    if (isDomainError(e) && e.code === "RATE_LIMITED")
      return redirectTo(req, "/reset-password", { error: "rate_limited" });
    throw e;
  }

  const supabase = await createServerSupabase();
  const redirectUrl = new URL("/api/auth/callback", env().NEXT_PUBLIC_APP_URL);
  redirectUrl.searchParams.set("next", "/reset-password/confirm");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl.toString() });
  if (error) log.warn("auth.reset_request_failed", { requestId: reqId, reason: error.code ?? error.message });
  else log.info("auth.reset_requested", { requestId: reqId });

  return redirectTo(req, "/reset-password", { sent: "1" });
}
