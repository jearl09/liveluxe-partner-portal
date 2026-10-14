import { redirect } from "next/navigation";
import { SecuritySettings } from "@/components/auth/security-settings";
import { ROLE_LABELS } from "@/components/team/people-panel";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import type { UserRole } from "@/lib/domain/permissions";

export const metadata = { title: "Settings" };

/**
 * Ops settings (brief §6.7): the things that are yours to change. The platform
 * tunables have no admin screen yet, so this page is your account only and says
 * nothing about what is coming.
 */
export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const p = await searchParams;
  const supabase = await createServerSupabase();
  const { data: me } = await supabase
    .from("partner_users")
    .select("full_name, email, role")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-1">Account</p>
        <h1 className="text-h1 text-text-primary font-serif tracking-tight">Settings</h1>
      </header>
      <section aria-labelledby="account-heading" className="border-subtle bg-surface rounded-card border">
        <div className="border-subtle border-b px-5 py-4">
          <h2 id="account-heading">Your account</h2>
        </div>
        <dl className="divide-subtle divide-y">
          {[
            ["Name", me?.full_name],
            ["Email", me?.email ?? claims.email],
            ["Role", me?.role ? (ROLE_LABELS[me.role as UserRole] ?? me.role) : null],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[14rem_1fr]">
              <dt className="text-text-muted text-body-sm">{k}</dt>
              <dd className="text-text-primary">{v || <span className="text-text-muted">Not set</span>}</dd>
            </div>
          ))}
        </dl>
      </section>
      <SecuritySettings
        settingsPath="/admin/settings"
        flash={{
          mfa: typeof p.mfa === "string" ? p.mfa : undefined,
          error: typeof p.error === "string" ? p.error : undefined,
        }}
      />
    </div>
  );
}
