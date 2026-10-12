/**
 * Shared handling of the people-management form actions (invite / revoke / disable /
 * enable) for the partner Team page and the ops Partners screen. Both routes
 * authenticate, pick the organisation, then hand over to handlePeopleAction().
 */
import "server-only";
import { isDomainError } from "@/lib/domain/errors";
import { USER_ROLES, type SessionClaims, type UserRole } from "@/lib/domain/permissions";
import { log } from "@/lib/observability/logger";
import { issueInvitation, revokeInvitation, setUserStatus } from "./invitations";
import { redirectTo, redirectWithCookie } from "./request";

/** HttpOnly cookie that carries a freshly issued invitation link to the next page, once, when email is off. */
export const INVITE_LINK_COOKIE = "llx_invite_link";

export interface PeopleActionFields {
  action: string;
  email: string;
  role: string;
  invitationId: string;
  userId: string;
}

export async function handlePeopleAction(
  req: Request,
  claims: SessionClaims,
  orgId: string,
  f: PeopleActionFields,
  back: string,
  requestId: string,
): Promise<Response> {
  try {
    switch (f.action) {
      case "invite": {
        if (!(USER_ROLES as readonly string[]).includes(f.role))
          return redirectTo(req, back, { error: "VALIDATION_FAILED", fields: "role", email: f.email });
        const issued = await issueInvitation(
          claims,
          { email: f.email, role: f.role as UserRole, orgId },
          req,
          requestId,
        );
        if (issued.emailed) return redirectTo(req, back, { done: "invited" });
        return redirectWithCookie(
          req,
          back,
          { done: "invited_nomail" },
          { name: INVITE_LINK_COOKIE, value: issued.inviteUrl ?? "", maxAgeSeconds: 300 },
        );
      }
      case "revoke":
        await revokeInvitation(claims, f.invitationId, req, requestId);
        return redirectTo(req, back, { done: "invitation_revoked" });
      case "disable":
        await setUserStatus(claims, f.userId, "disabled", req, requestId);
        return redirectTo(req, back, { done: "user_disabled" });
      case "enable":
        await setUserStatus(claims, f.userId, "active", req, requestId);
        return redirectTo(req, back, { done: "user_enabled" });
      default:
        return redirectTo(req, back, { error: "VALIDATION_FAILED", detail: "unknown action" });
    }
  } catch (e) {
    if (isDomainError(e)) {
      const fields = e.details?.fields as Record<string, string[]> | undefined;
      return redirectTo(req, back, {
        error: e.code,
        fields: fields ? Object.keys(fields).join(",") : undefined,
        detail:
          typeof e.details?.detail === "string"
            ? e.details.detail
            : fields
              ? Object.values(fields).flat()[0]
              : undefined,
        email: f.action === "invite" ? f.email : undefined,
        role: f.action === "invite" ? f.role : undefined,
      });
    }
    log.error("people.action_unhandled", {
      requestId,
      action: f.action,
      error: e instanceof Error ? e.stack : String(e),
    });
    return redirectTo(req, back, { error: "INTERNAL", ref: requestId });
  }
}
