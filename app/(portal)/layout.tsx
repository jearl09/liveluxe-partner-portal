import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { getMfaStatus } from "@/lib/auth/mfa";
import { mfaStepUpRequired } from "@/lib/domain/auth";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/search", label: "Search" },
  { href: "/requests", label: "Requests" },
  { href: "/basket", label: "Basket" },
  { href: "/invoices", label: "Invoices" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];

/** Partner-authenticated area. Server guard #2 (the proxy is #1, RLS is #3). */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  // Users who turned MFA on (Settings → Security) must verify a code once per session.
  const supabase = await createServerSupabase();
  const mfa = await getMfaStatus(supabase);
  if (mfaStepUpRequired({ aal: mfa.aal, hasVerifiedFactor: mfa.verifiedTotp.length > 0 }))
    redirect("/mfa/verify?next=/");
  const { data: org } = await supabase
    .from("partner_orgs")
    .select("name, logo_url")
    .eq("id", claims.org_id)
    .maybeSingle();
  return (
    <AppShell
      title="Partner portal"
      nav={NAV}
      user={{ email: claims.email, role: claims.role, orgName: org?.name, orgLogoUrl: org?.logo_url }}
    >
      {children}
    </AppShell>
  );
}
