import { SecuritySettings } from "@/components/auth/security-settings";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Settings" };

/**
 * Admin settings. Security (optional two-factor authentication, password) is live.
 * Business tunables from the `settings` table (hold hours, SLA, deposit %, tax rules) are Phase 3+.
 */
export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const p = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Settings" />
      <SecuritySettings
        settingsPath="/admin/settings"
        flash={{
          mfa: typeof p.mfa === "string" ? p.mfa : undefined,
          error: typeof p.error === "string" ? p.error : undefined,
        }}
      />
      <p className="text-muted-foreground text-sm">
        Business tunables (hold duration, SLA, deposit %, tax rules) are edited here from Phase 3.
      </p>
    </div>
  );
}
