/**
 * One Stripe Customer per partner organisation (§11.2). Created lazily the first
 * time the org pays or is invoiced; the id is stored on partner_orgs so every
 * later PaymentIntent and Invoice lands on the same customer in Stripe's dashboard.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { DomainError } from "@/lib/domain/errors";
import { getStripe } from "@/lib/stripe/client";
import { log } from "@/lib/observability/logger";

export interface OrgBilling {
  id: string;
  name: string;
  abn: string | null;
  billing_email: string | null;
  billing_contact_name: string | null;
  payment_terms: "prepay" | "deposit" | "net14" | "net30";
  credit_limit_cents: number | null;
  stripe_customer_id: string | null;
  deposit_pct: number | null;
  credit_standing: "good" | "watch" | "finance_approval" | "suspended";
  finance_contact_email: string | null;
  status: string;
}

export async function loadOrgBilling(orgId: string): Promise<OrgBilling> {
  const { data, error } = await adminDb()
    .from("partner_orgs")
    .select(
      "id, name, abn, billing_email, billing_contact_name, payment_terms, credit_limit_cents, stripe_customer_id, deposit_pct, credit_standing, finance_contact_email, status",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(`partner_orgs read failed: ${error.message}`);
  if (!data) throw new DomainError("NOT_FOUND", { orgId });
  return data;
}

/** Returns the Stripe customer id, creating the customer once. Idempotent on the org id. */
export async function ensureStripeCustomer(org: OrgBilling, fallbackEmail?: string | null): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id;
  const email = org.billing_email ?? fallbackEmail ?? undefined;
  const customer = await getStripe().customers.create(
    {
      name: org.name,
      email,
      metadata: { livluxe_org_id: org.id },
      ...(org.abn ? { tax_id_data: [{ type: "au_abn", value: org.abn }] } : {}),
    },
    { idempotencyKey: `cust:${org.id}` },
  );
  const { error } = await adminDb()
    .from("partner_orgs")
    .update({ stripe_customer_id: customer.id })
    .eq("id", org.id)
    .is("stripe_customer_id", null);
  if (error) log.warn("stripe.customer.save_failed", { orgId: org.id, error: error.message });
  log.info("stripe.customer.created", { orgId: org.id, customerId: customer.id });
  return customer.id;
}
