/**
 * Catalogue sync planning — spec §6.4 (hash-compare upsert, soft-delete absent).
 * Pure: decides WHAT to write; lib/jobs does the writing.
 */

export interface FetchedListing {
  hostawayListingId: number;
  contentHash: string;
}

export interface ExistingListing {
  hostawayListingId: number;
  contentHash: string | null;
  isActive: boolean;
}

export interface SyncPlan {
  /** New or changed: write the full row. */
  upsert: number[];
  /** Present and unchanged: only bump last_synced_at. */
  touch: number[];
  /** In our catalogue but no longer returned by Hostaway: soft-delete. */
  deactivate: number[];
  /** Previously deactivated, now back in the feed: upsert re-activates them. */
  reactivate: number[];
}

/**
 * @param complete  true only when every page was fetched. A partial fetch must
 *                  never deactivate listings that simply were not reached (§17.3).
 */
export function planListingSync(
  fetched: readonly FetchedListing[],
  existing: readonly ExistingListing[],
  complete: boolean,
): SyncPlan {
  const byId = new Map(existing.map((e) => [e.hostawayListingId, e]));
  const seen = new Set<number>();
  const plan: SyncPlan = { upsert: [], touch: [], deactivate: [], reactivate: [] };

  for (const f of fetched) {
    seen.add(f.hostawayListingId);
    const cur = byId.get(f.hostawayListingId);
    if (!cur) {
      plan.upsert.push(f.hostawayListingId);
      continue;
    }
    if (!cur.isActive) plan.reactivate.push(f.hostawayListingId);
    if (cur.contentHash !== f.contentHash || !cur.isActive) plan.upsert.push(f.hostawayListingId);
    else plan.touch.push(f.hostawayListingId);
  }

  if (complete) {
    for (const e of existing) {
      if (e.isActive && !seen.has(e.hostawayListingId)) plan.deactivate.push(e.hostawayListingId);
    }
  }
  return plan;
}

/** Split a list into fixed-size chunks for batched upserts. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Resumable cursor over listing ids for the calendar jobs. Returns the slice to
 * process this run and the cursor to store; wraps to the start when exhausted.
 */
export function nextCalendarBatch(
  orderedIds: readonly number[],
  cursorAfterId: number | null,
  batchSize: number,
): { ids: number[]; nextCursor: number | null; wrapped: boolean } {
  if (orderedIds.length === 0) return { ids: [], nextCursor: null, wrapped: false };
  let start = 0;
  if (cursorAfterId !== null) {
    const idx = orderedIds.findIndex((id) => id > cursorAfterId);
    start = idx === -1 ? 0 : idx;
  }
  const ids = orderedIds.slice(start, start + batchSize);
  const reachedEnd = start + batchSize >= orderedIds.length;
  return { ids, nextCursor: reachedEnd ? null : ids[ids.length - 1], wrapped: cursorAfterId !== null && start === 0 };
}
