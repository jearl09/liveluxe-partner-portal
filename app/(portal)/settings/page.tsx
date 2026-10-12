import { SecuritySettings } from "@/components/auth/security-settings";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Settings" };

/**
 * Partner user settings. Security (optional two-factor authentication, password) is live;
 * organisation defaults (PO number, cost centre, notification preferences) are Phase 2+.
 */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const p = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Settings" />
      <SecuritySettings
        settingsPath="/settings"
        flash={{
          mfa: typeof p.mfa === "string" ? p.mfa : undefined,
          error: typeof p.error === "string" ? p.error : undefined,
        }}
      />
      <p className="text-muted-foreground text-sm">
        Organisation defaults and notification preferences arrive in Phase 2.
      </p>
    </div>
  );
}
