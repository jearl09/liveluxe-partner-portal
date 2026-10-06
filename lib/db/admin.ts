/**
 * SERVICE-ROLE CLIENT — bypasses every RLS policy. Spec §8.3 "Service-role discipline":
 *
 *   - This is the ONLY module allowed to read SUPABASE_SERVICE_ROLE_KEY.
 *   - Import it ONLY from webhook handlers, cron jobs and explicitly-audited admin operations.
 *   - It must never be importable from app/(portal) or client code — enforced by the
 *     `no-restricted-imports` rule in eslint.config.mjs and checked in CI.
 *   - Every write made through this client MUST still append to audit_log.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./types";

let client: ReturnType<typeof createClient<Database>> | undefined;

export function adminDb() {
  if (!client) {
    const e = env();
    client = createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export interface AuditEntry {
  actorType: "partner" | "livluxe" | "system";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  impersonatedBy?: string | null;
  requestId?: string | null;
}

/** Append-only audit row. Bypassing RLS is not a licence to bypass accountability. */
export async function appendAudit(entry: AuditEntry) {
  const { error } = await adminDb()
    .from("audit_log")
    .insert({
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      impersonated_by: entry.impersonatedBy ?? null,
      request_id: entry.requestId ?? null,
    });
  if (error) throw new Error(`audit_log insert failed: ${error.message}`);
}
