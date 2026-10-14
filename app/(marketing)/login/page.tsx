import { SubmitButton } from "@/components/ui/submit-button";
import { Notice, inputClass } from "@/components/auth/notice";
import { PasswordInput } from "@/components/auth/password-input";
import { safeRedirectPath } from "@/lib/domain/auth";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  invalid: "Email or password not recognised.",
  missing: "Please enter both your email and password.",
  rate_limited: "Too many sign-in attempts. Try again in 15 minutes, or reset your password now.",
  link_invalid: "That link is invalid or has expired. Request a new one.",
};

/**
 * Invite-only sign-in (spec §8.1). There is no public sign-up.
 * Email + password → /api/auth/sign-in, which applies rate limiting and the TOTP step-up
 * for livluxe_* roles. Breached-password checks happen wherever a password is SET.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const needsSetup = params.setup === "supabase";
  const hookOff = params.setup === "hook";
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const next = safeRedirectPath(params.next);
  return (
    <form className="space-y-4" action="/api/auth/sign-in" method="post">
      <h1 className="text-strong font-serif text-2xl">Sign in</h1>
      {hookOff && (
        <Notice tone="warn">
          <p>
            You are signed in, but your session has no role. Enable the JWT hook in Supabase: Authentication → Hooks →
            Customize Access Token (JWT) Claims → <code>public.custom_access_token_hook</code>, then sign in again. Also
            confirm this user has an active row in <code>partner_users</code>.
          </p>
          <button type="submit" formAction="/api/auth/sign-out" formNoValidate className="underline">
            Sign out
          </button>
        </Notice>
      )}
      {params.reset === "done" && (
        <Notice tone="success">Your password has been changed. Sign in with the new one.</Notice>
      )}
      {params.invited === "1" && <Notice tone="success">Your account is ready. Sign in to continue.</Notice>}
      {error && (
        <Notice tone="error">
          <span id="signin-error">{error}</span>
          {params.error === "rate_limited" && (
            <>
              {" "}
              <a href="/reset-password" className="font-semibold underline">
                Reset your password
              </a>
            </>
          )}
        </Notice>
      )}
      {/* Only forward an explicit destination; otherwise the role decides (ops → /admin/queue). */}
      {params.next ? <input type="hidden" name="next" value={next} /> : null}
      {needsSetup && (
        <Notice tone="warn">
          Supabase is not configured. Fill in <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart <code>npm run dev</code>.
          See docs/GETTING-STARTED.md.
        </Notice>
      )}
      <p className="text-text-secondary text-sm">
        Access is by invitation. Ask your organisation&apos;s administrator if you need an account.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          aria-invalid={params.error === "invalid" || params.error === "missing" || undefined}
          aria-describedby={error ? "signin-error" : undefined}
          className={inputClass}
        />
      </label>
      <PasswordInput
        label="Password"
        name="password"
        required
        autoComplete="current-password"
        aria-invalid={params.error === "invalid" || params.error === "missing" || undefined}
        aria-describedby={error ? "signin-error" : undefined}
        className={inputClass}
      />
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-muted-foreground text-center text-xs">
        <a href="/reset-password" className="underline">
          Forgotten your password?
        </a>
      </p>
    </form>
  );
}
