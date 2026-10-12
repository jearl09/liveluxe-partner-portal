/**
 * POST /api/admin/partners/{id} — one partner organisation (spec §2.2, §8.1, §13.4).
 * action=update (settings) | invite | revoke | disable | enable (people).
 * Form posts from /admin/partners/{id}. Live Luxe admin only.
 */
import { requestId } from "@/lib/api/response";
import { handlePeopleAction } from "@/lib/auth/invite-link";
import { formFields, redirectTo } from "@/lib/auth/request";
import { appendAudit } from "@/lib/db/admin";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { ORG_FORM_FIELDS, parsePartnerOrgForm } from "@/lib/domain/partners";
import { can } from "@/lib/domain/permissions";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const reqId = requestId(req);
  const { id } = await ctx.params;
  const back = `/admin/partners/${id}`;
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: back });
  if (!can(claims.role, "partners.manage")) return redirectTo(req, "/admin/queue", { error: "FORBIDDEN" });

  const f = await formFields(req, [...ORG_FORM_FIELDS, "action", "email", "role", "invitationId", "userId"] as const);

  if (f.action !== "update") return handlePeopleAction(req, claims, id, f, back, reqId);

  const parsed = parsePartnerOrgForm(f);
  if (!parsed.ok) {
    const typed = Object.fromEntries(ORG_FORM_FIELDS.map((k) => [k, f[k]]));
    return redirectTo(req, back, {
      ...typed,
      error: "VALIDATION_FAILED",
      fields: Object.keys(parsed.errors).join(","),
      detail: Object.values(parsed.errors).flat()[0],
    });
  }
  const v = parsed.values;
  const supabase = await createServerSupabase();
  const { data: before } = await supabase.from("partner_orgs").select("*").eq("id", id).maybeSingle();
  if (!before) return redirectTo(req, "/admin/partners", { error: "NOT_FOUND" });

  const { error } = await supabase
    .from("partner_orgs")
    .update({
      name: v.name,
      type: v.type,
      status: v.status,
      abn: v.abn,
      billing_email: v.billingEmail,
      billing_contact_name: v.billingContactName,
      require_claim_ref: v.requireClaimRef,
      require_po_number: v.requirePoNumber,
      sla_hours: v.slaHours,
      payment_terms: v.paymentTerms,
      credit_limit_cents: v.creditLimitCents,
      email_domains: v.emailDomains,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    log.error("partner.update_failed", { requestId: reqId, id, error: error.message });
    return redirectTo(req, back, { error: "INTERNAL", ref: reqId });
  }

  await appendAudit({
    actorType: "livluxe",
    actorId: null,
    action: "partner.updated",
    entityType: "partner_orgs",
    entityId: id,
    before: {
      name: before.name,
      type: before.type,
      status: before.status,
      require_claim_ref: before.require_claim_ref,
      require_po_number: before.require_po_number,
      sla_hours: before.sla_hours,
    },
    after: v as unknown as Record<string, unknown>,
    requestId: reqId,
  });
  return redirectTo(req, back, { done: "partner_updated" });
}
