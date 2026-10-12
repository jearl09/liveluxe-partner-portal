import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Notice } from "@/components/auth/notice";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { ScrubParams } from "@/components/ui/scrub-params";
import { createServerSupabase } from "@/lib/db/server";
import { getMfaStatus } from "@/lib/auth/mfa";

/**
 * Settings → Security. Server component shared by the partner portal and the admin console.
 * Two-factor authentication is optional; this is the only place it is turned on or off,
 * and turning it off asks for a second press.
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
    <Panel flush aria-labelledby="security-heading">
      <PanelHeading
        id="security-heading"
        title="Security"
        description="Password and two-factor authentication for your account."
        flush
      />

      {(flash?.mfa || flash?.error) && (
        <div className="px-5 pt-4">
          <ScrubParams keys={["mfa", "error"]} />
          {flash?.mfa === "on" && <Notice tone="success">Two-factor authentication is on.</Notice>}
          {flash?.mfa === "off" && <Notice tone="info">Two-factor authentication is off.</Notice>}
          {flash?.error === "mfa_off_failed" && (
            <Notice tone="error">Two-factor authentication could not be turned off. Please try again.</Notice>
          )}
        </div>
      )}

      <div className="divide-border divide-y">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-strong font-medium">Two-factor authentication</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {on
                ? `On · ${status.verifiedTotp[0]?.friendlyName ?? "authenticator app"}. A 6-digit code is required at every sign-in.`
                : "Off. Adds a 6-digit code from an authenticator app at sign-in."}
            </p>
          </div>
          {on ? (
            <form action="/api/auth/mfa/unenroll" method="post">
              <input type="hidden" name="next" value={settingsPath} />
              <ConfirmButton variant="outline" confirmLabel="Confirm turn off" pendingLabel="Turning off…">
                Turn off
              </ConfirmButton>
            </form>
          ) : (
            <Button asChild size="sm">
              <a href={`/mfa/enrol?next=${encodeURIComponent(settingsPath + "?mfa=on")}`}>Turn on</a>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-strong font-medium">Password</p>
            <p className="text-muted-foreground mt-0.5 text-xs">Change it by requesting a reset link to your email.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/reset-password">Reset password</a>
          </Button>
        </div>
      </div>
    </Panel>
  );
}
