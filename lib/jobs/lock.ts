/**
 * Mutual exclusion for scheduled jobs and token minting — spec §3.2, §17.5.
 *
 * Implemented as a lease row (job_leases) rather than pg_advisory_lock: advisory
 * locks are bound to a Postgres session, and the REST layer's connection pool means
 * the unlock may run on a different session, leaking the lock. A lease has a TTL,
 * so a crashed invocation frees itself; a second concurrent invocation simply does
 * not get the lease and records a skip.
 */
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/db/admin";

interface LockOptions<T> {
  /** What to do when the lease is held by someone else. Defaults to returning undefined. */
  onLocked?: () => Promise<T>;
  /** Lease lifetime; must exceed the longest expected run. Default 6 min (route maxDuration is 5). */
  ttlSeconds?: number;
}

export async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>, opts: LockOptions<T> = {}): Promise<T> {
  const db = adminDb();
  const holder = randomUUID();
  const { data: acquired, error } = await db.rpc("job_lease_acquire", {
    p_key: key,
    p_holder: holder,
    p_ttl_seconds: opts.ttlSeconds ?? 360,
  });
  if (error) throw new Error(`job lease rpc failed: ${error.message}`);
  if (!acquired) {
    if (opts.onLocked) return opts.onLocked();
    return undefined as T;
  }
  try {
    return await fn();
  } finally {
    await db.rpc("job_lease_release", { p_key: key, p_holder: holder });
  }
}
