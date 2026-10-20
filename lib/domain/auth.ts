/**
 * Authentication policy — spec §8.1 (invite-only access), §8.2 (credentials, MFA, rate limits).
 *
 * Pure: no framework or I/O. The Route Handlers under app/api/auth apply these rules;
 * the database enforces tenancy. These limits are security controls from the spec,
 * not business tunables, so they live here rather than in the `settings` table.
 */
import { isLivluxeRole, type UserRole } from "./permissions";

/** Sliding-window limits on sign-in attempts (§8.2). */
export const LOGIN_RATE_LIMITS = {
  perAccount: { max: 5, windowSeconds: 15 * 60 },
  perIp: { max: 20, windowSeconds: 15 * 60 },
} as const;

/** Password reset and invitation acceptance share the per-IP budget shape. */
export const SENSITIVE_ACTION_RATE_LIMITS = {
  perAccount: { max: 5, windowSeconds: 60 * 60 },
  perIp: { max: 20, windowSeconds: 15 * 60 },
} as const;

export const INVITATION_TTL_HOURS = 7 * 24;

export const PASSWORD_POLICY = { minLength: 12, maxLength: 128 } as const;

export type PasswordProblem = "too_short" | "too_long" | "contains_email" | "mismatch";

/**
 * Local password policy (§8.2). Breach checking (HIBP) is an I/O concern handled by
 * lib/auth/hibp.ts; this covers only what can be decided from the string itself.
 */
export function validatePassword(password: string, opts: { email?: string; confirm?: string } = {}): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (password.length < PASSWORD_POLICY.minLength) problems.push("too_short");
  if (password.length > PASSWORD_POLICY.maxLength) problems.push("too_long");
  const local = opts.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) problems.push("contains_email");
  if (opts.confirm !== undefined && opts.confirm !== password) problems.push("mismatch");
  return problems;
}

export type InvitationState = "valid" | "expired" | "accepted";

export function evaluateInvitation(
  inv: { expiresAt: Date | string; acceptedAt?: Date | string | null },
  now: Date = new Date(),
): InvitationState {
  if (inv.acceptedAt) return "accepted";
  if (new Date(inv.expiresAt).getTime() <= now.getTime()) return "expired";
  return "valid";
}

/**
 * Who may invite whom (§2.3 "org.manage_users").
 *  - partner_admin: partner_* roles, own organisation only.
 *  - livluxe_admin: any role into any organisation.
 *  - everyone else: nobody.
 */
export function canInvite(
  inviter: { role: UserRole; orgId: string },
  target: { role: UserRole; orgId: string },
): boolean {
  if (inviter.role === "livluxe_admin") return true;
  if (inviter.role === "partner_admin") {
    return inviter.orgId === target.orgId && target.role.startsWith("partner_");
  }
  return false;
}

/** Supabase Authenticator Assurance Level. aal2 = a second factor was verified this session. */
export type AssuranceLevel = "aal1" | "aal2";

/**
 * MFA (TOTP) is MANDATORY for Live Luxe staff (livluxe_* roles, spec §8.2; confirmed by David on
 * 20 Oct 2026: staff approve bookings and see guest data) and optional for partners, who turn it
 * on from Settings → Security. Once enrolled, the per-session code prompt applies to everyone.
 */
export function mfaRequiredForRole(role: UserRole): boolean {
  return isLivluxeRole(role);
}

/** A staff member with no verified authenticator must set one up before reaching the console. */
export function mfaEnrolmentRequired(args: { role: UserRole; hasVerifiedFactor: boolean }): boolean {
  return mfaRequiredForRole(args.role) && !args.hasVerifiedFactor;
}

export function mfaStepUpRequired(args: { aal: AssuranceLevel; hasVerifiedFactor: boolean }): boolean {
  return args.hasVerifiedFactor && args.aal !== "aal2";
}

/**
 * The <img src> for the authenticator QR code. Supabase returns `totp.qr_code` already as a
 * `data:image/svg+xml;utf-8,…` URL; wrapping it again produced a broken image on the enrol page
 * (20 Oct 2026). A bare SVG string is wrapped once.
 */
export function totpQrImageSrc(qrCode: string): string {
  const v = qrCode.trim();
  if (v.startsWith("data:")) return v;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(v)}`;
}

/** Only ever redirect to a same-origin path. Protocol-relative ("//evil") and absolute URLs are rejected. */
export function safeRedirectPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}

/**
 * Where to send a user immediately after a successful password sign-in.
 * Staff without an authenticator are sent to set one up; users who have one are asked for their
 * code; everyone else goes straight through.
 */
export function postLoginDestination(args: {
  role: UserRole;
  aal: AssuranceLevel;
  hasVerifiedFactor: boolean;
  next?: unknown;
}): string {
  const next = safeRedirectPath(args.next, isLivluxeRole(args.role) ? "/admin/queue" : "/");
  if (mfaEnrolmentRequired(args)) return `/mfa/enrol?next=${encodeURIComponent(next)}`;
  if (!mfaStepUpRequired(args)) return next;
  return `/mfa/verify?next=${encodeURIComponent(next)}`;
}
