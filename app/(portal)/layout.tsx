import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { getMfaStatus } from "@/lib/auth/mfa";
import { mfaStepUpRequired } from "@/lib/domain/auth";
import { can } from "@/lib/domain/permissions";
import { env } from "@/lib/env";
import { loadShell } from "@/lib/layout/shell";

/** Partner-authenticated area. Server guard #2 (the proxy is #1, RLS is #3). */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  // Users who turned MFA on (Settings → Security) must verify a code once per session.
  const supabase = await createServerSupabase();
  const mfa = await getMfaStatus(supabase);
  if (mfaStepUpRequired({ aal: mfa.aal, hasVerifiedFactor: mfa.verifiedTotp.length > 0 }))
    redirect("/mfa/verify?next=/");
  const shell = await loadShell(claims, "partner");
  // Brief §7.1: Team only for administrators; Invoices hidden for viewers (the route itself
  // is still permitted for them until NEEDS_BACKEND.md #2 lands).
  const nav: NavItem[] = [
    { href: "/", label: "Dashboard" },
    { href: "/search", label: "Search" },
    { href: "/requests", label: "Requests" },
    ...(claims.role !== "partner_viewer" && can(claims.role, "invoices.download")
      ? [{ href: "/invoices", label: "Invoices" }]
      : []),
    ...(can(claims.role, "org.manage_users") ? [{ href: "/team", label: "Team" }] : []),
    { href: "/settings", label: "Settings" },
  ];
  return (
    <AppShell
      tone="partner"
      nav={nav}
      user={{
        name: shell.name,
        email: shell.email,
        role: shell.role,
        orgName: shell.orgName,
        orgLogoUrl: shell.orgLogoUrl,
      }}
      sync={shell.sync}
      supportEmail={env().EMAIL_REPLY_TO}
    >
      {children}
    </AppShell>
  );
}
