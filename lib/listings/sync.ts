/** Availability sync state for a page's SyncState line (brief §9). */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import { syncState, type SyncModel } from "@/lib/domain/progress";
import { circuitState } from "@/lib/hostaway/client";

export async function loadSyncState(now = new Date()): Promise<SyncModel> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("availability_freshness");
  const f = data?.[0];
  return syncState({
    lastSyncIso: f?.last_synced_at ?? null,
    now,
    staleAfterMinutes: f?.stale_after_minutes ?? 45,
    degraded: circuitState().open,
  });
}
