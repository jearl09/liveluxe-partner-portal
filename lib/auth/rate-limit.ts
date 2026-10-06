/**
 * Sliding-window rate limiting for authentication endpoints (spec §8.2).
 * Backed by public.auth_rate_limit_hit() so every Vercel instance shares one window.
 * Server-only: uses the service-role client — call it from Route Handlers under app/api only.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { DomainError } from "@/lib/domain/errors";
import { log } from "@/lib/observability/logger";

export interface RateLimitRule {
  max: number;
  windowSeconds: number;
}

/**
 * Records one attempt against `key` and returns whether it is within the rule.
 * Fails OPEN when the limiter itself is unavailable (e.g. the migration that creates
 * auth_rate_limit_hit() has not been applied): a broken limiter must degrade to "no limiting",
 * not "nobody can sign in". The degradation is logged at error level so it is never silent.
 */
export async function hitRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  const { data, error } = await adminDb().rpc("auth_rate_limit_hit", {
    p_key: key,
    p_max: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    log.error("auth.rate_limit_unavailable", {
      key: key.split(":").slice(0, 2).join(":"),
      error: error.message,
      hint: "Apply supabase/migrations/20261006120000_phase0_auth.sql",
    });
    return true;
  }
  return data === true;
}

/**
 * Applies every (key, rule) pair and throws RATE_LIMITED if any is exceeded.
 * All keys are hit even when the first fails so a burst against one account still
 * counts toward the per-IP budget.
 */
export async function assertWithinRateLimits(checks: Array<{ key: string; rule: RateLimitRule }>, requestId?: string) {
  const results = await Promise.all(checks.map((c) => hitRateLimit(c.key, c.rule)));
  const blocked = checks.filter((_, i) => !results[i]).map((c) => c.key.split(":").slice(0, 2).join(":"));
  if (blocked.length) {
    log.warn("auth.rate_limited", { requestId, buckets: blocked });
    throw new DomainError("RATE_LIMITED", { buckets: blocked });
  }
}

/** Normalises an email for use as a rate-limit key. */
export function accountKey(scope: string, email: string) {
  return `${scope}:account:${email.trim().toLowerCase()}`;
}

export function ipKey(scope: string, ip: string) {
  return `${scope}:ip:${ip}`;
}
