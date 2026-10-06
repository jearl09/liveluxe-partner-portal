/**
 * GET /api/auth/callback — lands Supabase email links (password recovery, magic link, invite)
 * and turns them into a cookie session, then redirects to `next`.
 *
 * Two link styles are supported so the Supabase email templates can use either:
 *   ?code=…                       PKCE flow (default `{{ .ConfirmationURL }}` with redirectTo = this route)
 *   ?token_hash=…&type=recovery   token-hash flow (`{{ .TokenHash }}` templates)
 */
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/db/server";
import { safeRedirectPath } from "@/lib/domain/auth";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";

const OTP_TYPES: EmailOtpType[] = ["recovery", "magiclink", "invite", "email", "signup", "email_change"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeRedirectPath(url.searchParams.get("next"), "/");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createServerSupabase();
  let errorMessage: string | undefined;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    errorMessage = error?.message;
  } else {
    errorMessage = "missing code";
  }

  if (errorMessage) {
    log.warn("auth.callback_failed", { reason: errorMessage });
    return Response.redirect(new URL(`/login?error=link_invalid`, url.origin).toString(), 303);
  }
  return Response.redirect(new URL(next, url.origin).toString(), 303);
}
