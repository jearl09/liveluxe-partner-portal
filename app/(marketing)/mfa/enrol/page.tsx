import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Notice, inputClass } from "@/components/auth/notice";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { getMfaStatus } from "@/lib/auth/mfa";
import { safeRedirectPath } from "@/lib/domain/auth";

export const metadata = { title: "Set up two-factor authentication" };

/**
 * /mfa/enrol — optional TOTP enrolment, reached from Settings → Security.
 * Each visit discards any half-finished (unverified) factor and starts a fresh one, because
 * the QR/secret are only returned at enrolment time. Verification posts to /api/auth/mfa/verify.
 * Requires TOTP to be enabled under Authentication → Multi-Factor in the Supabase project.
 */
export default async function MfaEnrolPage({ searchParams }: PageProps<"/mfa/enrol">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login?next=/mfa/enrol");
  const p = await searchParams;
  const settingsPath = claims.role.startsWith("livluxe_") ? "/admin/settings" : "/settings";
  const next = safeRedirectPath(p.next, settingsPath);
  const error = typeof p.error === "string" ? p.error : undefined;

  const supabase = await createServerSupabase();
  const status = await getMfaStatus(supabase);
  if (status.verifiedTotp.length > 0) {
    // Already on. Verify first if this session has not, otherwise manage it from Settings.
    redirect(status.aal === "aal2" ? settingsPath : `/mfa/verify?next=${encodeURIComponent(next)}`);
  }

  await Promise.all(status.unverifiedTotp.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));
  const { data: enrol, error: enrolError } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Livluxe Partner Portal",
    // Friendly names must be unique per user; include the time so a retry never collides.
    friendlyName: `Authenticator ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
  });

  if (enrolError || !enrol) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Two-factor authentication</h1>
        <Notice tone="error">
          Enrolment is not available right now ({enrolError?.message ?? "unknown error"}). If this persists, TOTP may
          not be enabled for this Supabase project: Authentication → Multi-Factor → TOTP.
        </Notice>
        <a href={settingsPath} className="block text-center text-sm underline">
          Back to settings
        </a>
      </div>
    );
  }

  const qrSrc = `data:image/svg+xml;utf-8,${encodeURIComponent(enrol.totp.qr_code)}`;

  return (
    <form className="space-y-4" action="/api/auth/mfa/verify" method="post">
      <h1 className="text-lg font-semibold">Set up two-factor authentication</h1>
      <p className="text-sm text-zinc-600">
        Scan the code with Google Authenticator, 1Password, Authy or similar, then enter the 6-digit code it shows. You
        will be asked for a code each time you sign in.
      </p>
      {error === "code" && (
        <Notice tone="error">That code was not accepted. Codes rotate every 30 seconds; try the current one.</Notice>
      )}
      {error === "rate_limited" && <Notice tone="error">Too many attempts. Please wait 15 minutes.</Notice>}
      <div className="flex justify-center rounded-md border bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI, never optimised */}
        <img src={qrSrc} alt="Authenticator QR code" width={192} height={192} />
      </div>
      <details className="text-xs text-zinc-600">
        <summary className="cursor-pointer">Can&apos;t scan? Enter the key manually</summary>
        <code className="mt-2 block rounded bg-zinc-100 p-2 font-mono break-all">{enrol.totp.secret}</code>
      </details>
      <input type="hidden" name="factorId" value={enrol.id} />
      <input type="hidden" name="mode" value="enrol" />
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">6-digit code</span>
        <input
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoComplete="one-time-code"
          autoFocus
          className={`${inputClass} font-mono tracking-[0.3em]`}
        />
      </label>
      <Button type="submit" className="w-full">
        Verify and turn on
      </Button>
      <p className="text-center text-xs text-zinc-500">
        <a href={settingsPath} className="underline">
          Cancel
        </a>
      </p>
    </form>
  );
}
