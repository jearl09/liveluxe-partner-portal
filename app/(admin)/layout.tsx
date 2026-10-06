import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { isLivluxeRole } from "@/lib/domain/permissions";
import { getMfaStatus } from "@/lib/auth/mfa";
import { mfaStepUpRequired } from "@/lib/domain/auth";

const NAV = [
  { href: "/admin/queue", label: "Queue" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/rate-cards", label: "Rate cards" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/settings", label: "Settings" },
];

/** Livluxe-authenticated console. Users who turned MFA on must verify a code each session. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  if (!isLivluxeRole(claims.role)) redirect("/");
  const mfa = await getMfaStatus(await createServerSupabase());
  if (mfaStepUpRequired({ aal: mfa.aal, hasVerifiedFactor: mfa.verifiedTotp.length > 0 }))
    redirect("/mfa/verify?next=/admin/queue");
  return (
    <AppShell tone="admin" title="Operations console" nav={NAV} user={{ email: claims.email, role: claims.role }}>
      {children}
    </AppShell>
  );
}
