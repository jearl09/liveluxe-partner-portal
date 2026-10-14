import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SecuritySettings } from "@/components/auth/security-settings";
import { ROLE_LABELS } from "@/components/team/people-panel";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { env } from "@/lib/env";
import type { UserRole } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };

const TERMS: Record<string, string> = {
  prepay: "Card held when you send a request, charged on approval",
  deposit: "Deposit by card on approval, balance invoiced before check-in",
  net14: "Invoice on approval, due in 14 days",
  net30: "Invoice on approval, due in 30 days",
};

function Facts({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <dl className="divide-subtle divide-y">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[14rem_1fr]">
          <dt className="text-text-muted text-body-sm">{k}</dt>
          <dd className="text-text-primary">{v || <span className="text-text-muted">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Settings (brief §7.9): your account and security, and your organisation's details as
 * Live Luxe holds them. Only what exists is shown; changes to the organisation's terms
 * and defaults go through Live Luxe.
 */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const p = await searchParams;
  const supabase = await createServerSupabase();
  const [{ data: me }, { data: org }] = await Promise.all([
    supabase.from("partner_users").select("full_name, email, role").eq("auth_user_id", claims.sub).maybeSingle(),
    supabase
      .from("partner_orgs")
      .select(
        "name, abn, payment_terms, billing_contact_name, billing_email, default_po_number, default_cost_centre, require_claim_ref, require_po_number",
      )
      .eq("id", claims.org_id)
      .maybeSingle(),
  ]);
  const support = env().EMAIL_REPLY_TO;
  const card = "border-subtle bg-surface rounded-card border";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-h1 text-text-primary font-serif tracking-tight">Settings</h1>
        <p className="text-text-secondary mt-1">
          Your account, your security, and your organisation as Live Luxe holds it.
        </p>
      </header>

      <section aria-labelledby="account-heading" className={card}>
        <div className="border-subtle border-b px-5 py-4">
          <h2 id="account-heading">Your account</h2>
        </div>
        <Facts
          rows={[
            ["Name", me?.full_name],
            ["Email", me?.email ?? claims.email],
            ["Role", me?.role ? (ROLE_LABELS[me.role as UserRole] ?? me.role) : null],
          ]}
        />
      </section>

      <SecuritySettings
        settingsPath="/settings"
        flash={{
          mfa: typeof p.mfa === "string" ? p.mfa : undefined,
          error: typeof p.error === "string" ? p.error : undefined,
        }}
      />

      {org && (
        <section aria-labelledby="org-heading" className={card}>
          <div className="border-subtle flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 id="org-heading">{org.name}</h2>
              <p className="text-text-secondary text-body-sm mt-0.5">
                Set with Live Luxe. To change any of these, email us.
              </p>
            </div>
            <a
              href={`mailto:${support}?subject=${encodeURIComponent(`Account change: ${org.name}`)}`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full sm:w-auto")}
            >
              <Mail className="h-4 w-4" aria-hidden /> Ask for a change
            </a>
          </div>
          <Facts
            rows={[
              ["How you pay", TERMS[org.payment_terms] ?? org.payment_terms],
              ["Billing contact", [org.billing_contact_name, org.billing_email].filter(Boolean).join(" · ") || null],
              ["ABN", org.abn],
              ["Default PO number", org.default_po_number],
              ["Default cost centre", org.default_cost_centre],
              [
                "Required on every request",
                [org.require_claim_ref && "Claim reference", org.require_po_number && "PO number"]
                  .filter(Boolean)
                  .join(" and ") || "Nothing beyond the guest's name",
              ],
            ]}
          />
        </section>
      )}
    </div>
  );
}
