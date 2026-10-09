import { Button } from "@/components/ui/button";
import { Notice, PASSWORD_ERRORS, inputClass } from "@/components/auth/notice";
import { PasswordFields } from "@/components/auth/password-fields";
import { createServerSupabase } from "@/lib/db/server";
import { evaluateInvitation } from "@/lib/domain/auth";
import { hashToken, isWellFormedToken } from "@/lib/auth/tokens";

export const metadata = { title: "Accept invitation" };

const ROLE_LABELS: Record<string, string> = {
  partner_admin: "Administrator",
  partner_booker: "Booker",
  partner_viewer: "Viewer",
  partner_finance: "Finance",
  livluxe_ops: "Livluxe operations",
  livluxe_finance: "Livluxe finance",
  livluxe_admin: "Livluxe administrator",
};

/**
 * /invite/[token] — invitation acceptance (spec §8.1).
 * The preview comes from the anonymous `invitation_preview` function keyed by SHA-256(token),
 * so this page never needs the service role. Acceptance posts to /api/auth/accept-invite.
 */
export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;

  if (!isWellFormedToken(token)) return <Invalid reason="not_found" />;

  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("invitation_preview", { p_token_hash: hashToken(token) });
  const inv = data?.[0];
  if (!inv) return <Invalid reason="not_found" />;
  const state = evaluateInvitation({ expiresAt: inv.expires_at, acceptedAt: inv.accepted_at });
  if (state !== "valid") return <Invalid reason={state} />;

  const err = typeof error === "string" ? error : undefined;
  const message =
    err &&
    (PASSWORD_ERRORS[err] ??
      {
        exists: "An account already exists for this email address. Sign in instead, or reset your password.",
        create_failed: "We could not create your account. Please try again or contact support.",
        rate_limited: "Too many attempts from this network. Please wait 15 minutes and try again.",
        expired: "This invitation has expired. Ask your administrator to send a new one.",
        accepted: "This invitation has already been used.",
      }[err]);

  return (
    <form className="space-y-4" action="/api/auth/accept-invite" method="post">
      <h1 className="text-navy-900 font-serif text-2xl">Join {inv.org_name}</h1>
      <p className="text-ink-700 text-sm">
        You have been invited as <strong>{ROLE_LABELS[inv.role] ?? inv.role}</strong>. Set a password to activate{" "}
        <strong>{inv.email}</strong>.
      </p>
      {message && <Notice tone="error">{message}</Notice>}
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Your name</span>
        <input name="fullName" type="text" autoComplete="name" maxLength={120} className={inputClass} />
      </label>
      <PasswordFields autoFocus />
      <Button type="submit" className="w-full">
        Activate account
      </Button>
      <p className="text-ink-500 text-center text-xs">
        Invitations expire 7 days after they are sent. Already have an account?{" "}
        <a href="/login" className="underline">
          Sign in
        </a>
        .
      </p>
    </form>
  );
}

function Invalid({ reason }: { reason: "not_found" | "expired" | "accepted" }) {
  const copy = {
    not_found: "This invitation link is not valid. Check that you copied the whole link from the email.",
    expired: "This invitation has expired. Ask your organisation's administrator to send a new one.",
    accepted: "This invitation has already been used. Sign in with the account you created.",
  }[reason];
  return (
    <div className="space-y-4">
      <h1 className="text-navy-900 font-serif text-2xl">Invitation unavailable</h1>
      <Notice tone="warn">{copy}</Notice>
      <a href="/login" className="block text-center text-sm underline">
        Go to sign in
      </a>
    </div>
  );
}
