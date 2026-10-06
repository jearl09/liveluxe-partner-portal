import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Notice, inputClass } from "@/components/auth/notice";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { getMfaStatus } from "@/lib/auth/mfa";
import { safeRedirectPath } from "@/lib/domain/auth";

export const metadata = { title: "Two-factor code" };

/** /mfa/verify — per-session TOTP step-up (spec §8.2). Posts to /api/auth/mfa/verify. */
export default async function MfaVerifyPage({ searchParams }: PageProps<"/mfa/verify">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login?next=/mfa/verify");
  const p = await searchParams;
  const next = safeRedirectPath(p.next, claims.role.startsWith("livluxe_") ? "/admin/queue" : "/");
  const error = typeof p.error === "string" ? p.error : undefined;

  const supabase = await createServerSupabase();
  const status = await getMfaStatus(supabase);
  if (status.aal === "aal2") redirect(next);
  if (status.verifiedTotp.length === 0) redirect(next); // MFA is optional; nothing to verify
  const factor = status.verifiedTotp[0]!;

  return (
    <form className="space-y-4" action="/api/auth/mfa/verify" method="post">
      <h1 className="text-lg font-semibold">Enter your authenticator code</h1>
      <p className="text-sm text-zinc-600">
        Open your authenticator app{factor.friendlyName ? ` (${factor.friendlyName})` : ""} and enter the current
        6-digit code for <strong>{claims.email}</strong>.
      </p>
      {error === "code" && <Notice tone="error">That code was not accepted. Try the current one.</Notice>}
      {error === "rate_limited" && <Notice tone="error">Too many attempts. Please wait 15 minutes.</Notice>}
      <input type="hidden" name="factorId" value={factor.id} />
      <input type="hidden" name="mode" value="verify" />
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
        Continue
      </Button>
      <p className="text-center text-xs text-zinc-500">
        Lost your device? Contact a Livluxe administrator to reset your authenticator.{" "}
        <button type="submit" formAction="/api/auth/sign-out" formNoValidate className="underline">
          Sign out
        </button>
      </p>
    </form>
  );
}
