/**
 * POST /api/auth/mfa/verify — verify a TOTP code against an enrolled factor (spec §8.2).
 * Used both to complete enrolment (first code after scanning the QR) and for the
 * per-session step-up. On success GoTrue issues an aal2 session; we then record
 * mfa_enrolled on the partner_users row (first time only) with an audit entry.
 */
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { adminDb, appendAudit } from "@/lib/db/admin";
import { log } from "@/lib/observability/logger";
import { LOGIN_RATE_LIMITS, safeRedirectPath } from "@/lib/domain/auth";
import { isDomainError } from "@/lib/domain/errors";
import { assertWithinRateLimits, ipKey } from "@/lib/auth/rate-limit";
import { clientIp, formFields, redirectTo, userAgent } from "@/lib/auth/request";
import { requestId } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reqId = requestId(req);
  const { factorId, code, next, mode } = await formFields(req, ["factorId", "code", "next", "mode"] as const);
  const back = mode === "enrol" ? "/mfa/enrol" : "/mfa/verify";
  const safeNext = safeRedirectPath(next, "/admin/queue");

  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return redirectTo(req, "/login", { next: safeNext });

  if (!factorId || !/^\d{6}$/.test(code)) return redirectTo(req, back, { error: "code", next: safeNext });

  try {
    await assertWithinRateLimits(
      [
        { key: `mfa:account:${user.id}`, rule: LOGIN_RATE_LIMITS.perAccount },
        { key: ipKey("mfa", clientIp(req)), rule: LOGIN_RATE_LIMITS.perIp },
      ],
      reqId,
    );
  } catch (e) {
    if (isDomainError(e) && e.code === "RATE_LIMITED")
      return redirectTo(req, back, { error: "rate_limited", next: safeNext });
    throw e;
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    log.warn("auth.mfa_verify_failed", { requestId: reqId, userId: user.id, reason: error.code ?? error.message });
    return redirectTo(req, back, { error: "code", next: safeNext });
  }

  // First successful verification completes enrolment. Service-role write + audit (§8.3 discipline).
  const claims = await getSessionClaims();
  const { data: row } = await adminDb()
    .from("partner_users")
    .select("id, mfa_enrolled")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (row && !row.mfa_enrolled) {
    await adminDb().from("partner_users").update({ mfa_enrolled: true }).eq("id", row.id);
    await appendAudit({
      actorType: claims?.role.startsWith("livluxe_") ? "livluxe" : "partner",
      actorId: row.id,
      action: "auth.mfa_enrolled",
      entityType: "partner_users",
      entityId: row.id,
      before: { mfa_enrolled: false },
      after: { mfa_enrolled: true, factorId },
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: reqId,
    });
  }
  log.info("auth.mfa_verified", { requestId: reqId, userId: user.id, outcome: mode || "step_up" });
  return redirectTo(req, safeNext);
}
