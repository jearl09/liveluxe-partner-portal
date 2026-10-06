/**
 * POST /api/invitations — issue an invitation (spec §8.1; capability org.manage_users §2.3).
 * Body: { email, role, orgId? }. orgId defaults to the caller's organisation.
 *
 * The row is inserted through the RLS client (policy invitations_org) so the database,
 * not this handler, is the tenancy boundary. The plaintext token exists only inside the
 * email; the table stores its SHA-256.
 */
import { z } from "zod";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { appendAudit } from "@/lib/db/admin";
import { env } from "@/lib/env";
import { fail, ok, parseBody, withApi } from "@/lib/api/response";
import { DomainError } from "@/lib/domain/errors";
import { USER_ROLES, can } from "@/lib/domain/permissions";
import { canInvite, INVITATION_TTL_HOURS } from "@/lib/domain/auth";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { clientIp, userAgent } from "@/lib/auth/request";
import { sendEmail } from "@/lib/notifications/email";
import Invitation from "@/lib/notifications/templates/invitation";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(254),
  role: z.enum(USER_ROLES),
  orgId: z.string().uuid().optional(),
});

export const POST = withApi<unknown>("POST /api/invitations", async (req, _ctx, { requestId }) => {
  const claims = await getSessionClaims();
  if (!claims) return fail("UNAUTHENTICATED", requestId);
  if (!can(claims.role, "org.manage_users")) return fail("FORBIDDEN", requestId);

  const body = await parseBody(req, Body);
  const orgId = body.orgId ?? claims.org_id;
  if (!canInvite({ role: claims.role, orgId: claims.org_id }, { role: body.role, orgId })) {
    return fail("FORBIDDEN", requestId, { reason: "cannot_invite_role_or_org" });
  }

  const supabase = await createServerSupabase();
  const [{ data: inviter }, { data: org }] = await Promise.all([
    supabase.from("partner_users").select("id, full_name, email").eq("auth_user_id", claims.sub).maybeSingle(),
    supabase.from("partner_orgs").select("id, name").eq("id", orgId).maybeSingle(),
  ]);
  if (!org) return fail("NOT_FOUND", requestId, { orgId });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600 * 1000);
  const { data: inv, error } = await supabase
    .from("invitations")
    .insert({
      org_id: orgId,
      email: body.email.toLowerCase(),
      role: body.role,
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
      });
    throw new Error(`invitation insert failed: ${error.message}`);
  }

  const e = env();
  const inviteUrl = `${e.NEXT_PUBLIC_APP_URL}/invite/${token}`;
  await sendEmail({
    to: body.email,
    subject: `You're invited to the Livluxe partner portal — ${org.name}`,
    template: Invitation({
      orgName: org.name,
      role: body.role,
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

  await appendAudit({
    actorType: claims.role.startsWith("livluxe_") ? "livluxe" : "partner",
    actorId: inviter?.id ?? null,
    action: "auth.invitation_sent",
    entityType: "invitations",
    entityId: inv.id,
    after: { email: body.email.toLowerCase(), role: body.role, orgId, expiresAt: expiresAt.toISOString() },
    ip: clientIp(req),
    userAgent: userAgent(req),
    requestId,
  });

  return ok({ id: inv.id, expiresAt: expiresAt.toISOString() }, { status: 201, requestId });
});
