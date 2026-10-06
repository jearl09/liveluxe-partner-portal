/**
 * POST /api/auth/accept-invite — turn an invitation into an account (spec §8.1).
 *
 * Steps, each of which fails closed:
 *  1. Per-IP rate limit; token shape check; look up by SHA-256(token).
 *  2. Invitation must be valid (not expired, not accepted).
 *  3. Password policy + HIBP breached-password check.
 *  4. Create the auth user (service role; email pre-confirmed — the invite email proved ownership).
 *  5. accept_invitation() creates the ACTIVE partner_users row and stamps the invitation atomically.
 *     If that fails the auth user is removed again so no orphan can sign in without a role.
 *  6. Audit, sign in, route to the MFA step if the role requires it.
 */
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { adminDb, appendAudit } from "@/lib/db/admin";
import { log } from "@/lib/observability/logger";
import {
  evaluateInvitation,
  postLoginDestination,
  SENSITIVE_ACTION_RATE_LIMITS,
  validatePassword,
} from "@/lib/domain/auth";
import { isDomainError } from "@/lib/domain/errors";
import { isPasswordBreached } from "@/lib/auth/hibp";
import { assertWithinRateLimits, ipKey } from "@/lib/auth/rate-limit";
import { hashToken, isWellFormedToken } from "@/lib/auth/tokens";
import { clientIp, formFields, redirectTo, userAgent } from "@/lib/auth/request";
import { requestId } from "@/lib/api/response";
import { getMfaStatus } from "@/lib/auth/mfa";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reqId = requestId(req);
  const { token, fullName, password, confirm } = await formFields(req, [
    "token",
    "fullName",
    "password",
    "confirm",
  ] as const);
  if (!isWellFormedToken(token)) return redirectTo(req, "/login", { error: "link_invalid" });
  const back = `/invite/${token}`;

  try {
    await assertWithinRateLimits(
      [{ key: ipKey("invite", clientIp(req)), rule: SENSITIVE_ACTION_RATE_LIMITS.perIp }],
      reqId,
    );
  } catch (e) {
    if (isDomainError(e) && e.code === "RATE_LIMITED") return redirectTo(req, back, { error: "rate_limited" });
    throw e;
  }

  const tokenHash = hashToken(token);
  const { data: preview, error: lookupError } = await adminDb().rpc("invitation_preview", { p_token_hash: tokenHash });
  const inv = preview?.[0];
  if (lookupError || !inv) return redirectTo(req, back, { error: "not_found" });
  const state = evaluateInvitation({ expiresAt: inv.expires_at, acceptedAt: inv.accepted_at });
  if (state !== "valid") return redirectTo(req, back, { error: state });

  const problems = validatePassword(password, { email: inv.email, confirm });
  if (problems.length) return redirectTo(req, back, { error: problems[0] });
  const hibp = await isPasswordBreached(password);
  if (hibp.breached) return redirectTo(req, back, { error: "breached" });

  const admin = adminDb();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || null },
  });
  if (createError || !created.user) {
    const exists = createError?.code === "email_exists" || /already/i.test(createError?.message ?? "");
    log.warn("auth.invite_create_user_failed", { requestId: reqId, reason: createError?.code ?? createError?.message });
    return redirectTo(req, back, { error: exists ? "exists" : "create_failed" });
  }

  const { data: partnerUserId, error: acceptError } = await admin.rpc("accept_invitation", {
    p_token_hash: tokenHash,
    p_auth_user_id: created.user.id,
    p_full_name: fullName,
  });
  if (acceptError || !partnerUserId) {
    log.error("auth.invite_accept_failed", { requestId: reqId, reason: acceptError?.message });
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    const reason = /EXPIRED/.test(acceptError?.message ?? "")
      ? "expired"
      : /ACCEPTED/.test(acceptError?.message ?? "")
        ? "accepted"
        : "create_failed";
    return redirectTo(req, back, { error: reason });
  }

  await appendAudit({
    actorType: "partner",
    actorId: partnerUserId,
    action: "auth.invitation_accepted",
    entityType: "partner_users",
    entityId: partnerUserId,
    after: { email: inv.email, role: inv.role, org: inv.org_name, hibpChecked: hibp.checked },
    ip: clientIp(req),
    userAgent: userAgent(req),
    requestId: reqId,
  });
  log.info("auth.invitation_accepted", { requestId: reqId, userId: created.user.id });

  // Sign the new user in on this response so they land inside the portal.
  const supabase = await createServerSupabase();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: inv.email, password });
  if (signInError) return redirectTo(req, "/login", { invited: "1" });
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { setup: "hook" });
  const mfa = await getMfaStatus(supabase);
  return redirectTo(req, postLoginDestination({ role: claims.role, aal: mfa.aal, hasVerifiedFactor: false }));
}
