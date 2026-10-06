/**
 * Hostaway OAuth2 client-credentials token management — spec §6.1.
 *
 * Acquisition: (1) in-memory cache → (2) integration_tokens table → (3) mint under a
 * Postgres advisory lock so concurrent serverless invocations do not stampede.
 * Tokens live ~24 months; we re-mint when < 30 days remain. A daily cron
 * (token-health) alerts at 60/30/7 days — the most likely long-term outage.
 */
import { env } from "@/lib/env";
import { adminDb } from "@/lib/db/admin";
import { withAdvisoryLock } from "@/lib/jobs/lock";
import { log } from "@/lib/observability/logger";
import { HostawayTokenResponse } from "./types";

const BASE = "https://api.hostaway.com";
const PROVIDER = "hostaway";
const RENEW_WINDOW_MS = 30 * 24 * 3600 * 1000;

let memo: { token: string; expiresAt: number } | undefined;

export async function getAccessToken(): Promise<string> {
  if (memo && memo.expiresAt - Date.now() > RENEW_WINDOW_MS) return memo.token;

  const { data } = await adminDb()
    .from("integration_tokens")
    .select("access_token, expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (data && new Date(data.expires_at).getTime() - Date.now() > RENEW_WINDOW_MS) {
    memo = { token: data.access_token, expiresAt: new Date(data.expires_at).getTime() };
    return memo.token;
  }

  return withAdvisoryLock(
    "hostaway:token:mint",
    async () => {
      // Re-check after acquiring the lock — another instance may have minted.
      const { data: fresh } = await adminDb()
        .from("integration_tokens")
        .select("access_token, expires_at")
        .eq("provider", PROVIDER)
        .maybeSingle();
      if (fresh && new Date(fresh.expires_at).getTime() - Date.now() > RENEW_WINDOW_MS) {
        memo = { token: fresh.access_token, expiresAt: new Date(fresh.expires_at).getTime() };
        return memo.token;
      }
      return mintToken();
    },
    {
      onLocked: async () => {
        await new Promise((r) => setTimeout(r, 1500));
        return getAccessToken();
      },
    },
  );
}

async function mintToken(): Promise<string> {
  const e = env();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: e.HOSTAWAY_ACCOUNT_ID,
    client_secret: e.HOSTAWAY_API_KEY,
    scope: "general",
  });
  const res = await fetch(`${BASE}/v1/accessTokens`, {
    method: "POST",
    headers: { "Content-type": "application/x-www-form-urlencoded", "Cache-control": "no-cache" },
    body,
  });
  if (!res.ok) {
    log.critical("hostaway.token.mint_failed", { status: res.status });
    throw new Error(`Hostaway token mint failed: HTTP ${res.status}`);
  }
  const parsed = HostawayTokenResponse.parse(await res.json());
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + parsed.expires_in * 1000);

  await adminDb().from("integration_tokens").upsert({
    provider: PROVIDER,
    access_token: parsed.access_token,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  // Hostaway caveat: a fresh token may not be immediately usable. Wait ≥ 1 s.
  await new Promise((r) => setTimeout(r, 1100));
  memo = { token: parsed.access_token, expiresAt: expiresAt.getTime() };
  log.info("hostaway.token.minted", { expiresAt: expiresAt.toISOString() });
  return parsed.access_token;
}

/** Called on a 401 mid-flight: the token was revoked or the key rotated. */
export function invalidateToken() {
  memo = undefined;
}

/** Admin "rotate credentials" action — revoke the current token. */
export async function revokeToken(): Promise<void> {
  const token = memo?.token;
  if (!token) return;
  await fetch(`${BASE}/v1/accessTokens?token=${encodeURIComponent(token)}`, { method: "DELETE" });
  invalidateToken();
  await adminDb().from("integration_tokens").delete().eq("provider", PROVIDER);
}

export async function tokenDaysRemaining(): Promise<number | null> {
  const { data } = await adminDb()
    .from("integration_tokens")
    .select("expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (!data) return null;
  return Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 86_400_000);
}
