import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { isLivluxeRole } from "@/lib/domain/permissions";
import { getMfaStatus } from "@/lib/auth/mfa";
import { mfaStepUpRequired } from "@/lib/domain/auth";
import { env } from "@/lib/env";
import { loadShell } from "@/lib/layout/shell";

/**
 * Live Luxe console. Only screens that exist are linked; calendar, reports, integrations
 * and audit slot in after Settings when they ship (brief §6.1). Users who turned MFA on
 * must verify a code each session.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  if (!isLivluxeRole(claims.role)) redirect("/");
  const mfa = await getMfaStatus(await createServerSupabase());
  if (mfaStepUpRequired({ aal: mfa.aal, hasVerifiedFactor: mfa.verifiedTotp.length > 0 }))
    redirect("/mfa/verify?next=/admin/queue");
  const shell = await loadShell(claims, "ops");
  const nav = [
    { href: "/admin/queue", label: "Queue", count: shell.queue?.live, alert: (shell.queue?.breached ?? 0) > 0 },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/partners", label: "Partners" },
    { href: "/admin/rate-cards", label: "Rate cards" },
    { href: "/admin/settings", label: "Settings" },
  ];
  return (
    <AppShell
      tone="ops"
      nav={nav}
      user={{ name: shell.name, email: shell.email, role: shell.role, orgName: "Live Luxe" }}
      sync={shell.sync}
      supportEmail={env().EMAIL_REPLY_TO}
    >
      {children}
    </AppShell>
  );
}
