/**
 * Breached-password check on every password set (spec §8.2) via the
 * Have I Been Pwned range API (k-anonymity: only the first 5 hex chars of the
 * SHA-1 leave the server). Fails OPEN on network trouble — a transient outage at
 * HIBP must not block a legitimate invite acceptance — but logs the degradation.
 */
import { createHash } from "node:crypto";
import { log } from "@/lib/observability/logger";

const HIBP_RANGE = "https://api.pwnedpasswords.com/range/";

export async function isPasswordBreached(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ breached: boolean; count: number; checked: boolean }> {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`${HIBP_RANGE}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "livluxe-partner-portal" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HIBP ${res.status}`);
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix === suffix) {
        const count = Number(countStr ?? "0");
        return { breached: count > 0, count, checked: true };
      }
    }
    return { breached: false, count: 0, checked: true };
  } catch (e) {
    log.warn("auth.hibp_unavailable", { error: e instanceof Error ? e.message : String(e) });
    return { breached: false, count: 0, checked: false };
  }
}
