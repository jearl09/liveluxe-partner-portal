/**
 * Postgres advisory locks for scheduled jobs and token minting — spec §3.2, §17.5.
 * A second concurrent invocation acquires no lock and exits cleanly, recording a skip.
 */
import { adminDb } from "@/lib/db/admin";

interface LockOptions<T> {
  /** What to do when the lock is held by someone else. Defaults to returning undefined. */
  onLocked?: () => Promise<T>;
}

export async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>, opts: LockOptions<T> = {}): Promise<T> {
  const db = adminDb();
  const { data: acquired, error } = await db.rpc("try_advisory_lock", { lock_key: key });
  if (error) throw new Error(`advisory lock rpc failed: ${error.message}`);
  if (!acquired) {
    if (opts.onLocked) return opts.onLocked();
    return undefined as T;
  }
  try {
    return await fn();
  } finally {
    await db.rpc("release_advisory_lock", { lock_key: key });
  }
}
