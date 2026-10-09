import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
      <h1 className="text-navy-900 font-serif text-2xl">Choose a new password</h1>
      <p className="text-ink-700 text-sm">
        Setting a new password for <strong>{data.user.email}</strong>. You will be asked to sign in again afterwards.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <PasswordFields autoFocus />
      <Button type="submit" className="w-full">
        Save password
      </Button>
    </form>
  );
}
