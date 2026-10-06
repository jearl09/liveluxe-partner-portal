import { Button } from "@/components/ui/button";
import { Notice, inputClass } from "@/components/auth/notice";

export const metadata = { title: "Reset password" };

/** /reset-password — request a recovery email (spec §8.2). Never reveals whether the address exists. */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const p = await searchParams;
  const sent = p.sent === "1";
  const error = typeof p.error === "string" ? p.error : undefined;

  return (
    <form className="space-y-4" action="/api/auth/reset-password" method="post">
      <h1 className="text-lg font-semibold">Reset your password</h1>
      {sent ? (
        <Notice tone="success">
          If an account exists for that address, a reset link is on its way. It expires after one hour. Check your spam
          folder if it does not arrive.
        </Notice>
      ) : (
        <p className="text-sm text-zinc-600">Enter the email address you sign in with and we will send a reset link.</p>
      )}
      {error === "rate_limited" && (
        <Notice tone="error">Too many reset requests. Please wait before trying again.</Notice>
      )}
      {error === "session" && (
        <Notice tone="error">That reset link has expired or was already used. Request a new one below.</Notice>
      )}
      {error === "missing" && <Notice tone="error">Please enter your email address.</Notice>}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <Button type="submit" className="w-full">
        Send reset link
      </Button>
      <p className="text-center text-xs text-zinc-500">
        <a href="/login" className="underline">
          Back to sign in
        </a>
      </p>
    </form>
  );
}
