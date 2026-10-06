/**
 * POST /api/auth/mfa/unenroll — turn two-factor authentication off (Settings → Security).
 * Supabase only allows removing a verified factor from an aal2 session, so an aal1 caller is
 * sent to /mfa/verify first and returns here afterwards. Clears mfa_enrolled and audits.
 */
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { adminDb, appendAudit } from "@/lib/db/admin";
import { log } from "@/lib/observability/logger";
import { safeRedirectPath } from "@/lib/domain/auth";
import { getMfaStatus } from "@/lib/auth/mfa";
import { clientIp, formFields, redirectTo, userAgent } from "@/lib/auth/request";
import { requestId } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reqId = requestId(req);
  const { next } = await formFields(req, ["next"] as const);
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login");
  const back = safeRedirectPath(next, claims.role.startsWith("livluxe_") ? "/admin/settings" : "/settings");

  const supabase = await createServerSupabase();
  const status = await getMfaStatus(supabase);
  if (status.verifiedTotp.length === 0) return redirectTo(req, back);
  if (status.aal !== "aal2") return redirectTo(req, "/mfa/verify", { next: back });

  for (const f of [...status.verifiedTotp, ...status.unverifiedTotp]) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) {
      log.warn("auth.mfa_unenroll_failed", { requestId: reqId, userId: claims.sub, reason: error.message });
      return redirectTo(req, back, { error: "mfa_off_failed" });
    }
  }

  const { data: row } = await adminDb().from("partner_users").select("id").eq("auth_user_id", claims.sub).maybeSingle();
  if (row) {
    await adminDb().from("partner_users").update({ mfa_enrolled: false }).eq("id", row.id);
    await appendAudit({
      actorType: claims.role.startsWith("livluxe_") ? "livluxe" : "partner",
      actorId: row.id,
      action: "auth.mfa_disabled",
      entityType: "partner_users",
      entityId: row.id,
      before: { mfa_enrolled: true },
      after: { mfa_enrolled: false },
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: reqId,
    });
  }
  log.info("auth.mfa_disabled", { requestId: reqId, userId: claims.sub });
  return redirectTo(req, back, { mfa: "off" });
}
