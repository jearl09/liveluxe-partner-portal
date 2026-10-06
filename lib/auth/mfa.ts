/**
 * MFA state for the current session (spec §8.2 — TOTP mandatory for livluxe_* roles).
 * Works with the RLS-aware server client; no service role involved.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssuranceLevel } from "@/lib/domain/auth";

export interface MfaStatus {
  aal: AssuranceLevel;
  /** aal2 when at least one verified factor exists, otherwise aal1. */
  nextLevel: AssuranceLevel;
  verifiedTotp: Array<{ id: string; friendlyName: string | null }>;
  unverifiedTotp: Array<{ id: string }>;
}

export async function getMfaStatus(supabase: SupabaseClient): Promise<MfaStatus> {
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  const totp = factors?.totp ?? [];
  return {
    aal: (aal?.currentLevel as AssuranceLevel | null) ?? "aal1",
    nextLevel: (aal?.nextLevel as AssuranceLevel | null) ?? "aal1",
    verifiedTotp: totp
      .filter((f) => f.status === "verified")
      .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null })),
    unverifiedTotp: totp.filter((f) => f.status !== "verified").map((f) => ({ id: f.id })),
  };
}
