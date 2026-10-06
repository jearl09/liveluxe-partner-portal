/**
 * POST /api/auth/reset-password/confirm — set a new password on a recovery session (spec §8.2).
 * The user arrives here with a session created by /api/auth/callback from the recovery email.
 * Applies the local password policy and the HIBP breached-password check, then signs the user
 * out so they log in fresh (which also re-applies the MFA step-up for Livluxe roles).
 */
import { createServerSupabase } from "@/lib/db/server";
import { log } from "@/lib/observability/logger";
import { validatePassword } from "@/lib/domain/auth";
import { isPasswordBreached } from "@/lib/auth/hibp";
import { formFields, redirectTo } from "@/lib/auth/request";
import { requestId } from "@/lib/api/response";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reqId = requestId(req);
  const { password, confirm } = await formFields(req, ["password", "confirm"] as const);

  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return redirectTo(req, "/reset-password", { error: "session" });

  const problems = validatePassword(password, { email: user.email ?? undefined, confirm });
  if (problems.length) return redirectTo(req, "/reset-password/confirm", { error: problems[0] });

  const hibp = await isPasswordBreached(password);
  if (hibp.breached) return redirectTo(req, "/reset-password/confirm", { error: "breached" });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    log.warn("auth.reset_update_failed", { requestId: reqId, userId: user.id, reason: error.code ?? error.message });
    return redirectTo(req, "/reset-password/confirm", { error: "update_failed" });
  }
  log.info("auth.password_reset", { requestId: reqId, userId: user.id, hibpChecked: hibp.checked });

  await supabase.auth.signOut();
  return redirectTo(req, "/login", { reset: "done" });
}
