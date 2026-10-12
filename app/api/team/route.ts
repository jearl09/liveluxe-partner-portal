/**
 * POST /api/team — a partner administrator manages their own organisation's people
 * (spec §2.3 org.manage_users, §8.1). action=invite | revoke | disable | enable.
 * Always scoped to the caller's organisation; the RLS policies are the second guard.
 */
import { requestId } from "@/lib/api/response";
import { handlePeopleAction } from "@/lib/auth/invite-link";
import { formFields, redirectTo } from "@/lib/auth/request";
import { getSessionClaims } from "@/lib/db/server";
import { can } from "@/lib/domain/permissions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reqId = requestId(req);
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: "/team" });
  if (!can(claims.role, "org.manage_users")) return redirectTo(req, "/team", { error: "FORBIDDEN" });
  const f = await formFields(req, ["action", "email", "role", "invitationId", "userId"] as const);
  return handlePeopleAction(req, claims, claims.org_id, f, "/team", reqId);
}
