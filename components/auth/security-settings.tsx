import { Button } from "@/components/ui/button";
import { Notice } from "@/components/auth/notice";
import { createServerSupabase } from "@/lib/db/server";
import { getMfaStatus } from "@/lib/auth/mfa";

/**
 * Settings → Security. Server component shared by the partner portal and the admin console.
 * Two-factor authentication is optional; this is the only place it is turned on or off.
 */
export async function SecuritySettings({
  settingsPath,
  flash,
}: {
  settingsPath: string;
  flash?: { mfa?: string; error?: string };
}) {
  const status = await getMfaStatus(await createServerSupabase());
  const on = status.verifiedTotp.length > 0;

  return (
    <section className="space-y-4 rounded-lg border bg-white p-4">
      <div>
        <h2 className="text-base font-semibold">Security</h2>
        <p className="text-sm text-zinc-600">Password and two-factor authentication for your account.</p>
      </div>

      {flash?.mfa === "on" && <Notice tone="success">Two-factor authentication is on.</Notice>}
      {flash?.mfa === "off" && <Notice tone="info">Two-factor authentication is off.</Notice>}
      {flash?.error === "mfa_off_failed" && (
        <Notice tone="error">Two-factor authentication could not be turned off. Please try again.</Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="text-sm">
          <div className="font-medium">Two-factor authentication (authenticator app)</div>
          <div className="text-xs text-zinc-600">
            {on
              ? `On · ${status.verifiedTotp[0]?.friendlyName ?? "authenticator"}. A 6-digit code is required at every sign-in.`
              : "Off · Optional. Adds a 6-digit code from an authenticator app at sign-in."}
          </div>
        </div>
        {on ? (
          <form action="/api/auth/mfa/unenroll" method="post">
            <input type="hidden" name="next" value={settingsPath} />
            <Button type="submit" variant="outline" size="sm">
              Turn off
            </Button>
          </form>
        ) : (
          <Button asChild size="sm">
            <a href={`/mfa/enrol?next=${encodeURIComponent(settingsPath + "?mfa=on")}`}>Turn on</a>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="text-sm">
          <div className="font-medium">Password</div>
          <div className="text-xs text-zinc-600">Change it by requesting a reset link to your email.</div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/reset-password">Reset password</a>
        </Button>
      </div>
    </section>
  );
}
