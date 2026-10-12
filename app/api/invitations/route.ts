/**
 * POST /api/invitations — issue an invitation (spec §8.1; capability org.manage_users §2.3).
 * Body: { email, role, orgId? }. orgId defaults to the caller's organisation.
 * The Team and Partners screens post forms to their own routes; all three share issueInvitation().
 */
import { z } from "zod";
import { getSessionClaims } from "@/lib/db/server";
import { fail, ok, parseBody, withApi } from "@/lib/api/response";
import { USER_ROLES } from "@/lib/domain/permissions";
import { issueInvitation } from "@/lib/auth/invitations";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(254),
  role: z.enum(USER_ROLES),
  orgId: z.string().uuid().optional(),
});

export const POST = withApi<unknown>("POST /api/invitations", async (req, _ctx, { requestId }) => {
  const claims = await getSessionClaims();
  if (!claims) return fail("UNAUTHENTICATED", requestId);
  const body = await parseBody(req, Body);
  const issued = await issueInvitation(
    claims,
    { email: body.email, role: body.role, orgId: body.orgId ?? claims.org_id },
    req,
    requestId,
  );
  return ok({ id: issued.id, expiresAt: issued.expiresAt, emailed: issued.emailed }, { status: 201, requestId });
});
