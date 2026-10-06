import { SecuritySettings } from "@/components/auth/security-settings";

export const metadata = { title: "Settings" };

/**
 * Partner user settings. Security (optional two-factor authentication, password) is live;
 * organisation defaults (PO number, cost centre, notification preferences) are Phase 2+.
 */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const p = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SecuritySettings
        settingsPath="/settings"
        flash={{
          mfa: typeof p.mfa === "string" ? p.mfa : undefined,
          error: typeof p.error === "string" ? p.error : undefined,
        }}
      />
      <section className="rounded-lg border border-dashed p-6 text-sm text-zinc-500">
        Organisation defaults and notification preferences arrive in Phase 2.
      </section>
    </div>
  );
}
