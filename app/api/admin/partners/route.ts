/**
 * POST /api/admin/partners — create a partner organisation (spec §2.2, §13.4).
 * Form post from /admin/partners. Live Luxe admin only (partners.manage); the RLS
 * policy org_all_livluxe is the database-side guard.
 */
import { requestId } from "@/lib/api/response";
import { formFields, redirectTo } from "@/lib/auth/request";
import { appendAudit } from "@/lib/db/admin";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { ORG_FORM_FIELDS, parsePartnerOrgForm } from "@/lib/domain/partners";
import { can } from "@/lib/domain/permissions";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reqId = requestId(req);
  const back = "/admin/partners";
  const claims = await getSessionClaims();
  if (!claims) return redirectTo(req, "/login", { next: back });
  if (!can(claims.role, "partners.manage")) return redirectTo(req, back, { error: "FORBIDDEN" });

  const f = await formFields(req, ORG_FORM_FIELDS);
  const parsed = parsePartnerOrgForm({ ...f, status: "active" });
  if (!parsed.ok) {
    return redirectTo(req, back, {
      ...f,
      error: "VALIDATION_FAILED",
      fields: Object.keys(parsed.errors).join(","),
      detail: Object.values(parsed.errors).flat()[0],
    });
  }
  const v = parsed.values;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("partner_orgs")
    .insert({
      name: v.name,
      type: v.type,
      status: "active",
      abn: v.abn,
      billing_email: v.billingEmail,
      billing_contact_name: v.billingContactName,
      require_claim_ref: v.requireClaimRef,
      require_po_number: v.requirePoNumber,
      sla_hours: v.slaHours,
      // The commercial terms the form collects; the edit route saves the same set.
      payment_terms: v.paymentTerms,
      credit_limit_cents: v.creditLimitCents,
      deposit_pct: v.depositPct,
      finance_contact_email: v.financeContactEmail,
      email_domains: v.emailDomains,
    })
    .select("id")
    .single();
  if (error || !data) {
    log.error("partner.create_failed", { requestId: reqId, error: error?.message });
    return redirectTo(req, back, { ...f, error: "INTERNAL", ref: reqId });
  }

  await appendAudit({
    actorType: "livluxe",
    actorId: null,
    action: "partner.created",
    entityType: "partner_orgs",
    entityId: data.id,
    after: v as unknown as Record<string, unknown>,
    requestId: reqId,
  });
  return redirectTo(req, `/admin/partners/${data.id}`, { done: "partner_created" });
}
