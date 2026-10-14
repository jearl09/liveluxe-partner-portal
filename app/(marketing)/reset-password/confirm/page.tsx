import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice, PASSWORD_ERRORS } from "@/components/auth/notice";
import { PasswordFields } from "@/components/auth/password-fields";
import { createServerSupabase } from "@/lib/db/server";

export const metadata = { title: "Choose a new password" };

/**
 * /reset-password/confirm — second step of recovery (spec §8.2).
 * Reached via /api/auth/callback, which exchanged the emailed link for a session.
 */
export default async function ResetConfirmPage({ searchParams }: PageProps<"/reset-password/confirm">) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/reset-password?error=session");

  const p = await searchParams;
  const error = typeof p.error === "string" ? PASSWORD_ERRORS[p.error] : undefined;

  return (
    <form className="space-y-4" action="/api/auth/reset-password/confirm" method="post">
      <p className="text-text-muted text-body-sm font-semibold">Step 2 of 2 · Set a new password</p>
      <h1 className="text-strong font-serif text-2xl">Choose a new password</h1>
      <p className="text-foreground text-sm">
        Setting a new password for <strong>{data.user.email}</strong>. You will be asked to sign in again afterwards.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <PasswordFields autoFocus />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Save password
      </SubmitButton>
    </form>
  );
}
