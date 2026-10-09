/**
 * Sliding-window rate limiting for authentication endpoints (spec §8.2).
 * Backed by public.auth_attempts / auth_rate_limit_hit() so every Vercel instance shares one window.
 * Server-only: uses the service-role client — call it from Route Handlers under app/api only.
 *
 * Checking and recording are separate so sign-in counts only FAILED attempts: a
 * busy partner logging in six times in a morning must never lock themselves out,
 * while six wrong passwords still do. Routes where every request is sensitive
 * (password reset, invite acceptance) record each one.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { DomainError } from "@/lib/domain/errors";
import { log } from "@/lib/observability/logger";

export interface RateLimitRule {
  max: number;
  windowSeconds: number;
}

export interface RateLimitCheck {
  key: string;
  rule: RateLimitRule;
}

const bucketOf = (key: string) => key.split(":").slice(0, 2).join(":");

/** Fail OPEN when the limiter itself is unavailable; a broken limiter must not lock everyone out. */
function unavailable(key: string, error: { message: string }) {
  log.error("auth.rate_limit_unavailable", {
    key: bucketOf(key),
    error: error.message,
    hint: "Apply supabase/migrations/20261006120000_phase0_auth.sql",
  });
}

/** True while `key` has fewer than `rule.max` recorded attempts in the window. Records nothing. */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  const since = new Date(Date.now() - rule.windowSeconds * 1000).toISOString();
  const { count, error } = await adminDb()
    .from("auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("key", key)
    .gte("attempted_at", since);
  if (error) {
    unavailable(key, error);
    return true;
  }
  return (count ?? 0) < rule.max;
}

/** Records one attempt against `key` and returns whether it is still within the rule. */
export async function hitRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  const { data, error } = await adminDb().rpc("auth_rate_limit_hit", {
    p_key: key,
    p_max: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    unavailable(key, error);
    return true;
  }
  return data === true;
}

/**
 * Throws RATE_LIMITED if any (key, rule) pair is exhausted. By default this only
 * checks; pass `{ record: true }` to also count this request (sensitive actions).
 */
export async function assertWithinRateLimits(
  checks: RateLimitCheck[],
  requestId?: string,
  opts: { record?: boolean } = {},
) {
  const results = await Promise.all(
    checks.map((c) => (opts.record ? hitRateLimit(c.key, c.rule) : checkRateLimit(c.key, c.rule))),
  );
  const blocked = checks.filter((_, i) => !results[i]).map((c) => bucketOf(c.key));
  if (blocked.length) {
    log.warn("auth.rate_limited", { requestId, buckets: blocked });
    throw new DomainError("RATE_LIMITED", { buckets: blocked });
  }
}

/** Counts a failed attempt against every key (sign-in, MFA code). Never throws. */
export async function recordFailedAttempts(checks: RateLimitCheck[]) {
  await Promise.all(checks.map((c) => hitRateLimit(c.key, c.rule)));
}

/** Normalises an email for use as a rate-limit key. */
export function accountKey(scope: string, email: string) {
  return `${scope}:account:${email.trim().toLowerCase()}`;
}

export function ipKey(scope: string, ip: string) {
  return `${scope}:ip:${ip}`;
}
