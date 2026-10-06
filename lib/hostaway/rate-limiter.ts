/**
 * Distributed request governor — spec §6.2.
 *
 * Hostaway allows ~15 req / 10 s per IP and ~20 / 10 s per account. Serverless
 * instances share no memory, so the token bucket lives in Postgres
 * (hostaway_rate_limit table + hostaway_rate_limit_acquire() function in the
 * initial migration). Budget is 12 / 10 s, split into two priority buckets:
 *   interactive — 4 / 10 s, reserved for user-facing checks (approval-time re-check)
 *   bulk        — 8 / 10 s, for cron syncs
 * A partner waiting on a screen must never queue behind a nightly reconciliation.
 */
import { adminDb } from "@/lib/db/admin";

export type Priority = "interactive" | "bulk";

const BUCKETS: Record<Priority, { max: number; refillPerSec: number }> = {
  interactive: { max: 4, refillPerSec: 0.4 },
  bulk: { max: 8, refillPerSec: 0.8 },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const rateLimiter = {
  /** Blocks until a token is available for the bucket, or throws after maxWaitMs. */
  async acquire(priority: Priority, maxWaitMs = 30_000): Promise<void> {
    const { max, refillPerSec } = BUCKETS[priority];
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const { data, error } = await adminDb().rpc("hostaway_rate_limit_acquire", {
        p_bucket: priority,
        p_max_tokens: max,
        p_refill_per_sec: refillPerSec,
      });
      if (error) throw new Error(`rate limiter rpc failed: ${error.message}`);
      if (data === true) return;
      if (Date.now() > deadline) throw new Error(`rate limiter: timed out waiting for '${priority}' budget`);
      await sleep(priority === "interactive" ? 250 : 750);
    }
  },
};

/** Spread bulk work: stagger by a deterministic hash so syncs never fire all at once. */
export function staggerSlice(listingId: number, slices: number): number {
  return Math.abs(listingId) % slices;
}
