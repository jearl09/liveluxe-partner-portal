/**
 * POST /api/auth/sign-in — email + password via Supabase Auth (spec §8.1/§8.2).
 * Form post from /login. Sets the session cookies through @supabase/ssr and redirects.
 *
 * Controls applied here:
 *  - rate limiting: 5 / account / 15 min and 20 / IP / 15 min (shared window in Postgres)
 *  - TOTP step-up for livluxe_* roles: routed to /mfa/enrol or /mfa/verify before the console
 */
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { log } from "@/lib/observability/logger";
import { LOGIN_RATE_LIMITS, postLoginDestination, safeRedirectPath } from "@/lib/domain/auth";
import { accountKey, assertWithinRateLimits, ipKey } from "@/lib/auth/rate-limit";
import { clientIp, formFields, redirectTo } from "@/lib/auth/request";
import { getMfaStatus } from "@/lib/auth/mfa";
import { isDomainError } from "@/lib/domain/errors";
import { requestId } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reqId = requestId(req);
  const { email, password, next } = await formFields(req, ["email", "password", "next"] as const);
  const safeNext = safeRedirectPath(next);

  if (!email || !password) return redirectTo(req, "/login", { error: "missing", next: safeNext });

  try {
    await assertWithinRateLimits(
      [
        { key: accountKey("login", email), rule: LOGIN_RATE_LIMITS.perAccount },
        { key: ipKey("login", clientIp(req)), rule: LOGIN_RATE_LIMITS.perIp },
      ],
      reqId,
    );
  } catch (e) {
    if (isDomainError(e) && e.code === "RATE_LIMITED")
      return redirectTo(req, "/login", { error: "rate_limited", next: safeNext });
    throw e;
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    log.warn("auth.sign_in_failed", { requestId: reqId, reason: error.code ?? error.message });
    return redirectTo(req, "/login", { error: "invalid", next: safeNext });
  }

  // Role comes from the JWT hook; MFA state from GoTrue. Both are cheap reads on the fresh session.
  const claims = await getSessionClaims();
  if (!claims) {
    // Signed in but no role claim: hook not enabled or user not active. The proxy explains this on /login.
    return redirectTo(req, "/login", { setup: "hook" });
  }
  const mfa = await getMfaStatus(supabase);
  log.info("auth.sign_in", { requestId: reqId, userId: claims.sub, orgId: claims.org_id, outcome: mfa.aal });
  return redirectTo(
    req,
    postLoginDestination({
      role: claims.role,
      aal: mfa.aal,
      hasVerifiedFactor: mfa.verifiedTotp.length > 0,
      next: safeNext,
    }),
  );
}
