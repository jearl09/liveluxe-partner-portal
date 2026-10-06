import { SecuritySettings } from "@/components/auth/security-settings";

export const metadata = { title: "Settings" };

/**
 * Admin settings. Security (optional two-factor authentication, password) is live.
 * Business tunables from the `settings` table (hold hours, SLA, deposit %, tax rules) are Phase 3+.
 */
export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const p = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SecuritySettings
        settingsPath="/admin/settings"
        flash={{
          mfa: typeof p.mfa === "string" ? p.mfa : undefined,
          error: typeof p.error === "string" ? p.error : undefined,
        }}
      />
      <section className="rounded-lg border border-dashed p-6 text-sm text-zinc-500">
        Business tunables (hold duration, SLA, deposit %, tax rules) are edited here from Phase 3.
      </section>
    </div>
  );
}
