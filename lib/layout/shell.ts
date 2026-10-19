/**
 * What the app shells need on every page (brief §6.1, §7.1): who is signed in, which
 * organisation, availability freshness for the header dot, and — for ops — the live
 * queue count for the Queue nav badge. One small set of queries per request, all on the
 * RLS client, so a partner only ever counts their own organisation.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import { displayName } from "@/lib/domain/display-name";
import type { SessionClaims } from "@/lib/domain/permissions";
import { syncState, type SyncModel } from "@/lib/domain/progress";
import { circuitState } from "@/lib/hostaway/client";

export interface ShellData {
  name: string | null;
  email: string | null;
  role: SessionClaims["role"];
  orgName: string | null;
  orgLogoUrl: string | null;
  /** Partner only: the organisation's status ("active", "suspended", …); null on the ops side. */
  orgStatus: string | null;
  sync: SyncModel;
  /** Ops only: requests waiting on Live Luxe, and how many of them are past their decision time. */
  queue: { live: number; breached: number } | null;
}

export async function loadShell(claims: SessionClaims, side: "partner" | "ops"): Promise<ShellData> {
  const supabase = await createServerSupabase();
  const now = new Date();
  const [user, org, fresh, live, breached] = await Promise.all([
    supabase.from("partner_users").select("full_name, email").eq("auth_user_id", claims.sub).maybeSingle(),
    side === "partner"
      ? supabase.from("partner_orgs").select("name, logo_url, status").eq("id", claims.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("availability_freshness"),
    side === "ops"
      ? supabase
          .from("booking_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["SUBMITTED", "UNDER_REVIEW"])
      : Promise.resolve({ count: null }),
    side === "ops"
      ? supabase
          .from("booking_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["SUBMITTED", "UNDER_REVIEW"])
          .is("sla_paused_at", null)
          .lt("decision_due_at", now.toISOString())
      : Promise.resolve({ count: null }),
  ]);
  const f = fresh.data?.[0];
  return {
    name: displayName(user.data?.full_name, user.data?.email ?? claims.email),
    email: user.data?.email ?? claims.email ?? null,
    role: claims.role,
    orgName: org.data?.name ?? null,
    orgLogoUrl: org.data?.logo_url ?? null,
    orgStatus: org.data?.status ?? null,
    sync: syncState({
      lastSyncIso: f?.last_synced_at ?? null,
      now,
      staleAfterMinutes: f?.stale_after_minutes ?? 45,
      degraded: circuitState().open,
    }),
    queue: side === "ops" ? { live: live.count ?? 0, breached: breached.count ?? 0 } : null,
  };
}
