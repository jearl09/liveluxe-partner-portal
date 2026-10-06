/**
 * The governed Hostaway client — spec §6.2 / §6.3 / §6.7.
 *
 * SINGLE CHOKE POINT. Every Hostaway call goes through hostawayFetch(). A direct
 * fetch() to api.hostaway.com anywhere else is a lint error (eslint.config.mjs).
 *
 *   - distributed token bucket with interactive/bulk priority
 *   - cached, lock-guarded bearer token; 401 → invalidate, mint once, retry once
 *   - retry on 429/5xx with exponential backoff + full jitter (base 1 s, max 5, cap 30 s), honours Retry-After
 *   - circuit breaker: 5 consecutive failures → open for 60 s; reads served from cache, writes blocked
 *   - response envelope unwrapped; status != "success" is an error even on HTTP 200
 *   - writes refused unless hostawayWritesEnabled() (production only)
 */
import { env, hostawayWritesEnabled } from "@/lib/env";
import { log } from "@/lib/observability/logger";
import { rateLimiter, type Priority } from "./rate-limiter";
import { getAccessToken, invalidateToken } from "./token";
import { HostawayEnvelope, type HostawayResult } from "./types";
import { z } from "zod";

const BASE = "https://api.hostaway.com/v1";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Circuit breaker state is per serverless instance; the admin dashboard reads
// the authoritative view from sync_runs. Good enough to stop a retry storm.
const breaker = { failures: 0, openUntil: 0 };
const BREAKER_THRESHOLD = 5;
const BREAKER_OPEN_MS = 60_000;

export interface HostawayFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  priority?: Priority;
  /** Required for every write. Stored on the booking row before the call (outbox pattern). */
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Allow the token endpoint itself through without auth. */
  skipAuth?: boolean;
}

export function circuitState() {
  const open = Date.now() < breaker.openUntil;
  return { open, failures: breaker.failures, openUntil: open ? new Date(breaker.openUntil).toISOString() : null };
}

export async function hostawayFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  opts: HostawayFetchOptions = {},
): Promise<HostawayResult<T>> {
  const method = opts.method ?? "GET";
  const isWrite = WRITE_METHODS.has(method);

  if (isWrite && !hostawayWritesEnabled()) {
    log.warn("hostaway.write_blocked", { path, method, vercelEnv: env().VERCEL_ENV });
    return {
      ok: false,
      status: 0,
      code: "WRITES_DISABLED",
      message: "Hostaway writes are disabled in this environment.",
    };
  }
  if (isWrite && !opts.idempotencyKey) {
    throw new Error(`hostawayFetch: idempotencyKey is required for ${method} ${path}`);
  }
  if (Date.now() < breaker.openUntil) {
    return { ok: false, status: 0, code: "CIRCUIT_OPEN", message: "Hostaway circuit open; serving cached data." };
  }

  await rateLimiter.acquire(opts.priority ?? "bulk");

  const maxAttempts = isWrite ? 1 : 5; // never retry non-idempotent writes blindly (§6.7)
  let attempt = 0;
  let retriedAuth = false;

  for (;;) {
    attempt++;
    const token = await getAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-type": "application/json",
          "Cache-control": "no-cache",
          ...(opts.idempotencyKey ? { "X-Idempotency-Key": opts.idempotencyKey } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      recordFailure();
      log.warn("hostaway.timeout", { path, method, attempt, durationMs: Date.now() - started });
      if (isWrite)
        return {
          ok: false,
          status: 0,
          code: "TIMEOUT",
          message: "Write timed out; outcome unknown — reconcile by query, do not retry.",
        };
      if (attempt >= maxAttempts) return { ok: false, status: 0, code: "TIMEOUT", message: String(e) };
      await backoff(attempt, null);
      continue;
    }
    clearTimeout(timer);
    log.info("hostaway.call", { path, method, status: res.status, attempt, durationMs: Date.now() - started });

    if (res.status === 401 && !retriedAuth) {
      retriedAuth = true;
      invalidateToken();
      continue;
    }
    if (res.status === 401) {
      recordFailure();
      log.critical("hostaway.auth_failed_after_retry", { path });
      return {
        ok: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "Hostaway credentials rejected; integration is down.",
      };
    }
    if (res.status === 429 || res.status >= 500) {
      recordFailure();
      if (attempt >= maxAttempts) {
        return {
          ok: false,
          status: res.status,
          code: res.status === 429 ? "RATE_LIMITED" : "SERVER_ERROR",
          message: `HTTP ${res.status}`,
        };
      }
      await backoff(attempt, res.headers.get("retry-after"));
      continue;
    }

    const json: unknown = await res.json().catch(() => null);
    const envelope = HostawayEnvelope(z.unknown()).safeParse(json);
    if (!envelope.success || envelope.data.status !== "success") {
      recordFailure();
      return {
        ok: false,
        status: res.status,
        code: "ENVELOPE_FAIL",
        message: envelope.success ? String(envelope.data.message ?? envelope.data.status) : "unexpected response shape",
      };
    }
    const parsed = schema.safeParse(envelope.data.result);
    if (!parsed.success) {
      log.error("hostaway.parse_failed", { path, issues: parsed.error.issues.slice(0, 5) });
      return {
        ok: false,
        status: res.status,
        code: "PARSE_FAIL",
        message: "Hostaway payload did not match expected shape (API drift?)",
      };
    }
    breaker.failures = 0;
    return { ok: true, status: res.status, data: parsed.data };
  }
}

function recordFailure() {
  breaker.failures++;
  if (breaker.failures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_OPEN_MS;
    log.critical("hostaway.circuit_opened", {
      failures: breaker.failures,
      openUntil: new Date(breaker.openUntil).toISOString(),
    });
  }
}

async function backoff(attempt: number, retryAfter: string | null) {
  let ms: number;
  if (retryAfter && /^\d+$/.test(retryAfter)) ms = Number(retryAfter) * 1000;
  else ms = Math.random() * Math.min(30_000, 1000 * 2 ** (attempt - 1)); // full jitter
  await new Promise((r) => setTimeout(r, ms));
}
