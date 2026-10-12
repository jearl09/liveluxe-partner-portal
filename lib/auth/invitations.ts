/**
 * Issue an invitation (spec §8.1; capability org.manage_users §2.3). Shared by the
 * JSON API and the Team / Partners form posts so both behave identically.
 *
 * The row is inserted through the RLS client (policy invitations_org) so the
 * database, not this module, is the tenancy boundary. The plaintext token exists
 * only in the emailed URL (or, when email is not configured on this environment,
 * in the one-time link handed back to the inviter); the table stores its SHA-256.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import { appendAudit } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { DomainError } from "@/lib/domain/errors";
import { canInvite, INVITATION_TTL_HOURS } from "@/lib/domain/auth";
import { can, type SessionClaims, type UserRole } from "@/lib/domain/permissions";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { clientIp, userAgent } from "@/lib/auth/request";
import { sendEmail } from "@/lib/notifications/email";
import Invitation from "@/lib/notifications/templates/invitation";
import { log } from "@/lib/observability/logger";

export interface IssueInvitationInput {
  email: string;
  role: UserRole;
  orgId: string;
}

export interface IssuedInvitation {
  id: string;
  expiresAt: string;
  /** Present only when the email could not be sent, so the inviter can pass the link on. */
  inviteUrl: string | null;
  emailed: boolean;
}

export async function issueInvitation(
  claims: SessionClaims,
  input: IssueInvitationInput,
  req: Request,
  requestId: string,
): Promise<IssuedInvitation> {
  if (!can(claims.role, "org.manage_users")) throw new DomainError("FORBIDDEN");
  if (!canInvite({ role: claims.role, orgId: claims.org_id }, { role: input.role, orgId: input.orgId }))
    throw new DomainError("FORBIDDEN", { reason: "cannot_invite_role_or_org" });

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new DomainError("VALIDATION_FAILED", { fields: { email: ["Enter a valid email address."] } });

  const supabase = await createServerSupabase();
  const [{ data: inviter }, { data: org }, { data: existing }] = await Promise.all([
    supabase.from("partner_users").select("id, full_name, email").eq("auth_user_id", claims.sub).maybeSingle(),
    supabase.from("partner_orgs").select("id, name").eq("id", input.orgId).maybeSingle(),
    supabase.from("partner_users").select("id").eq("org_id", input.orgId).eq("email", email).maybeSingle(),
  ]);
  if (!org) throw new DomainError("NOT_FOUND", { orgId: input.orgId });
  if (existing)
    throw new DomainError("VALIDATION_FAILED", {
      fields: { email: ["That person already has an account in this organisation."] },
      detail: "That person already has an account in this organisation.",
    });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600 * 1000);
  const { data: inv, error } = await supabase
    .from("invitations")
    .insert({
      org_id: input.orgId,
      email,
      role: input.role,
      token_hash: hashToken(token),
      invited_by: inviter?.id ?? null,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      throw new DomainError("VALIDATION_FAILED", {
        fields: { email: ["An open invitation already exists for this address."] },
        detail: "An open invitation already exists for this address. Revoke it first to send a new one.",
      });
    throw new Error(`invitation insert failed: ${error.message}`);
  }

  const e = env();
  const inviteUrl = `${e.NEXT_PUBLIC_APP_URL}/invite/${token}`;
  let emailed = true;
  try {
    await sendEmail({
      to: email,
      subject: `You're invited to the Livluxe partner portal — ${org.name}`,
      template: Invitation({
        orgName: org.name,
        role: input.role,
        inviteUrl,
        invitedBy: inviter?.full_name ?? inviter?.email ?? "Livluxe",
        expiresLabel:
          expiresAt.toLocaleString("en-AU", {
            timeZone: "Australia/Melbourne",
            dateStyle: "medium",
            timeStyle: "short",
          }) + " AEST/AEDT",
        supportEmail: e.EMAIL_REPLY_TO,
      }),
      idempotencyKey: `invitation:${inv.id}`,
      tags: { template: "invitation" },
    });
  } catch (err) {
    emailed = false;
    log.warn("invitation.email_failed", {
      requestId,
      invitationId: inv.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await appendAudit({
    actorType: claims.role.startsWith("livluxe_") ? "livluxe" : "partner",
    actorId: inviter?.id ?? null,
    action: "auth.invitation_sent",
    entityType: "invitations",
    entityId: inv.id,
    after: { email, role: input.role, orgId: input.orgId, expiresAt: expiresAt.toISOString(), emailed },
    ip: clientIp(req),
    userAgent: userAgent(req),
    requestId,
  });

  return { id: inv.id, expiresAt: expiresAt.toISOString(), inviteUrl: emailed ? null : inviteUrl, emailed };
}

/** Revoke an open invitation. RLS restricts this to the inviter's organisation (or Live Luxe admin). */
export async function revokeInvitation(claims: SessionClaims, invitationId: string, req: Request, requestId: string) {
  if (!can(claims.role, "org.manage_users")) throw new DomainError("FORBIDDEN");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .is("accepted_at", null)
    .select("id, email, org_id")
    .maybeSingle();
  if (error) throw new Error(`invitation delete failed: ${error.message}`);
  if (!data) throw new DomainError("NOT_FOUND", { invitationId });
  await appendAudit({
    actorType: claims.role.startsWith("livluxe_") ? "livluxe" : "partner",
    actorId: null,
    action: "auth.invitation_revoked",
    entityType: "invitations",
    entityId: invitationId,
    before: { email: data.email, orgId: data.org_id },
    ip: clientIp(req),
    userAgent: userAgent(req),
    requestId,
  });
}

/** Disable or re-enable a user's access. Disabled users keep their history but cannot sign in. */
export async function setUserStatus(
  claims: SessionClaims,
  userId: string,
  status: "active" | "disabled",
  req: Request,
  requestId: string,
) {
  if (!can(claims.role, "org.manage_users")) throw new DomainError("FORBIDDEN");
  const supabase = await createServerSupabase();
  const { data: target } = await supabase
    .from("partner_users")
    .select("id, org_id, role, status, auth_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (!target) throw new DomainError("NOT_FOUND", { userId });
  if (target.auth_user_id === claims.sub)
    throw new DomainError("VALIDATION_FAILED", { detail: "You cannot change your own access." });
  if (!canInvite({ role: claims.role, orgId: claims.org_id }, { role: target.role as UserRole, orgId: target.org_id }))
    throw new DomainError("FORBIDDEN");

  const { error } = await supabase.from("partner_users").update({ status }).eq("id", userId);
  if (error) throw new Error(`partner_users update failed: ${error.message}`);

  // The JWT hook reads partner_users.status when the access token is minted, so a
  // disabled user loses their role claims at the next refresh (within the hour).

  await appendAudit({
    actorType: claims.role.startsWith("livluxe_") ? "livluxe" : "partner",
    actorId: null,
    action: status === "disabled" ? "auth.user_disabled" : "auth.user_enabled",
    entityType: "partner_users",
    entityId: userId,
    before: { status: target.status },
    after: { status },
    ip: clientIp(req),
    userAgent: userAgent(req),
    requestId,
  });
}
