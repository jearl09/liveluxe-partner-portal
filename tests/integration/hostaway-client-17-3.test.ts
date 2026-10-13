/**
 * Spec §17.3 — the governed client (lib/hostaway/client.ts) under each failure
 * mode: 401 (expired / revoked / rotated credentials), 429, 5xx + circuit breaker,
 * write timeouts (never retried), payload drift (Zod parse failure). The network is
 * a scripted fetch; the token store and rate limiter are stubbed so only the
 * client's own behaviour is under test. Backoff sleeps are made instant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/logger", () => {
  const noop = () => {};
  return { log: { debug: noop, info: noop, warn: noop, error: noop, critical: noop }, redact: (v: unknown) => v };
});
vi.mock("@/lib/hostaway/token", () => {
  const state = { token: "tok-1", mints: 0, invalidations: 0 };
  return {
    __state: state,
    getAccessToken: async () => state.token,
    invalidateToken: () => {
      state.invalidations++;
      state.mints++;
      state.token = `tok-${state.mints + 1}`;
    },
  };
});
vi.mock("@/lib/hostaway/rate-limiter", () => ({
  rateLimiter: { acquire: async () => {} },
  staggerSlice: (id: number, n: number) => id % n,
}));

import { z } from "zod";
import { circuitState, hostawayFetch, resetCircuitForTests } from "@/lib/hostaway/client";
import { resetEnvCacheForTests } from "@/lib/env";

type Scripted = { status: number; body?: unknown; headers?: Record<string, string> } | "timeout";
const script: Scripted[] = [];
const seen: { url: string; method: string; headers: Record<string, string> }[] = [];

function installFetch() {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    seen.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string> });
    const next = script.shift();
    if (!next) throw new Error("fetch script exhausted");
    if (next === "timeout") {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }
    return new Response(next.body == null ? "" : JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json", ...(next.headers ?? {}) },
    });
  });
}

const ok = (result: unknown) => ({ status: 200, body: { status: "success", result } });
const Item = z.object({ id: z.number() });

beforeEach(async () => {
  script.length = 0;
  seen.length = 0;
  process.env.HOSTAWAY_ALLOW_WRITES = "true";
  process.env.HOSTAWAY_WRITE_TARGET = "test";
  process.env.HOSTAWAY_TEST_ACCOUNT_ID = process.env.HOSTAWAY_ACCOUNT_ID;
  resetEnvCacheForTests();
  resetCircuitForTests();
  installFetch();
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 20 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("§17.3 — access token expired or revoked (401)", () => {
  it("invalidates the cache, mints once, retries once, then succeeds", async () => {
    const tok = (await import("@/lib/hostaway/token")) as unknown as { __state: { invalidations: number } };
    script.push({ status: 401 }, ok({ id: 1 }));
    const res = await hostawayFetch("/listings/1", Item);
    expect(res.ok).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[0].headers.Authorization).toBe("Bearer tok-1");
    expect(seen[1].headers.Authorization).toBe("Bearer tok-2");
    expect(tok.__state.invalidations).toBe(1);
  });

  it("a second 401 is final: UNAUTHORIZED, counted towards the circuit, never a third attempt", async () => {
    script.push({ status: 401 }, { status: 401 });
    const res = await hostawayFetch("/listings/1", Item);
    expect(res).toMatchObject({ ok: false, status: 401, code: "UNAUTHORIZED" });
    expect(seen).toHaveLength(2);
    expect(circuitState().failures).toBe(1);
  });

  it("credentials rotated by another staff member (401 storm) opens the circuit so the admin console can show the recovery path", async () => {
    for (let i = 0; i < 5; i++) script.push({ status: 401 }, { status: 401 });
    for (let i = 0; i < 5; i++) await hostawayFetch("/listings/1", Item);
    expect(circuitState().open).toBe(true);
    script.push(ok({ id: 1 }));
    const res = await hostawayFetch("/listings/1", Item);
    expect(res).toMatchObject({ ok: false, code: "CIRCUIT_OPEN" });
    expect(seen).toHaveLength(10); // nothing reaches the network while open
  });
});

describe("§17.3 — rate limit (429) hit", () => {
  it("backs off (honouring Retry-After) and succeeds without surfacing to the caller", async () => {
    script.push({ status: 429, headers: { "retry-after": "0" } }, { status: 429 }, ok({ id: 7 }));
    const res = await hostawayFetch("/listings/7", Item, { priority: "bulk" });
    expect(res.ok).toBe(true);
    expect(seen).toHaveLength(3);
  });

  it("gives up after the retry cap with RATE_LIMITED", async () => {
    for (let i = 0; i < 5; i++) script.push({ status: 429, headers: { "retry-after": "0" } });
    const res = await hostawayFetch("/listings/7", Item);
    expect(res).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(seen).toHaveLength(5);
  });
});

describe("§17.3 — Hostaway 5xx or timeout", () => {
  /** Backoff is exponential with full jitter (≤ 31 s over five attempts); drive the fake clock only until the call settles. */
  async function withBackoff<T>(p: Promise<T>): Promise<T> {
    let settled = false;
    p.then(
      () => (settled = true),
      () => (settled = true),
    );
    for (let i = 0; i < 70 && !settled; i++) await vi.advanceTimersByTimeAsync(1_000);
    return p;
  }

  it("retries reads to a cap, then circuit-breaks for 60 s; reads during the break are refused fast", async () => {
    for (let i = 0; i < 5; i++) script.push({ status: 503 });
    const res = await withBackoff(hostawayFetch("/listings/1", Item));
    expect(res).toMatchObject({ ok: false, code: "SERVER_ERROR", status: 503 });
    expect(circuitState()).toMatchObject({ open: true, failures: 5 });
    script.push(ok({ id: 1 }));
    expect(await hostawayFetch("/listings/1", Item)).toMatchObject({ ok: false, code: "CIRCUIT_OPEN" });
    // 60 s later the circuit closes and the next call goes through.
    await vi.advanceTimersByTimeAsync(61_000);
    expect((await hostawayFetch("/listings/1", Item)).ok).toBe(true);
  });

  it("writes are blocked entirely while the circuit is open — approvals are disabled with an explicit reason", async () => {
    for (let i = 0; i < 5; i++) script.push({ status: 500 });
    await withBackoff(hostawayFetch("/listings/1", Item));
    const res = await hostawayFetch("/reservations", Item, { method: "POST", body: {}, idempotencyKey: "k" });
    expect(res).toMatchObject({ ok: false, code: "CIRCUIT_OPEN" });
    expect(seen.filter((s) => s.method === "POST")).toHaveLength(0);
  });

  it("a read timeout is retried; a write timeout is never retried and reports outcome unknown (§6.7)", async () => {
    script.push("timeout", ok({ id: 2 }));
    expect((await hostawayFetch("/listings/2", Item)).ok).toBe(true);
    expect(seen).toHaveLength(2);
    seen.length = 0;
    script.push("timeout");
    const w = await hostawayFetch("/reservations", Item, { method: "POST", body: { x: 1 }, idempotencyKey: "ha:b1" });
    expect(w).toMatchObject({ ok: false, code: "TIMEOUT" });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers["X-Idempotency-Key"]).toBe("ha:b1");
  });

  it("a write without an idempotency key is a programming error, not a network call", async () => {
    await expect(hostawayFetch("/reservations", Item, { method: "POST", body: {} })).rejects.toThrow(
      /idempotencyKey is required/,
    );
    expect(seen).toHaveLength(0);
  });

  it("a 5xx on a write is reported once (no blind retry) and counts towards the breaker", async () => {
    script.push({ status: 502 });
    const w = await hostawayFetch("/reservations", Item, { method: "POST", body: {}, idempotencyKey: "k2" });
    expect(w).toMatchObject({ ok: false, code: "SERVER_ERROR", status: 502 });
    expect(seen).toHaveLength(1);
    expect(circuitState().failures).toBe(1);
  });
});

describe("§17.3 — listing fields change shape (API version drift)", () => {
  it("a Zod parse failure is reported as PARSE_FAIL for that call only; the next call still works", async () => {
    script.push(ok({ id: "not-a-number" }), ok({ id: 3 }));
    expect(await hostawayFetch("/listings/3", Item)).toMatchObject({ ok: false, code: "PARSE_FAIL" });
    expect((await hostawayFetch("/listings/3", Item)).ok).toBe(true);
  });

  it("a non-success envelope on HTTP 200 is an error, never silently accepted", async () => {
    script.push({ status: 200, body: { status: "fail", message: "Listing not found" } });
    expect(await hostawayFetch("/listings/9", Item)).toMatchObject({
      ok: false,
      code: "ENVELOPE_FAIL",
      message: "Listing not found",
    });
  });
});

describe("the write switch (§5.1 guard + Phase 5 test-account target)", () => {
  it("refuses every write when HOSTAWAY_ALLOW_WRITES is off, without touching the network", async () => {
    process.env.HOSTAWAY_ALLOW_WRITES = "false";
    resetEnvCacheForTests();
    const res = await hostawayFetch("/reservations", Item, { method: "POST", body: {}, idempotencyKey: "k" });
    expect(res).toMatchObject({ ok: false, code: "WRITES_DISABLED" });
    expect(seen).toHaveLength(0);
  });

  it("refuses to start when the test target is declared but the configured account is not the test account", async () => {
    process.env.HOSTAWAY_TEST_ACCOUNT_ID = "some-other-account";
    resetEnvCacheForTests();
    const { env } = await import("@/lib/env");
    expect(() => env()).toThrow(/not the declared test account/);
  });

  it("refuses HOSTAWAY_WRITE_TARGET=test in production and ALLOW_WRITES outside production without the test target", async () => {
    const { env } = await import("@/lib/env");
    process.env.VERCEL_ENV = "production";
    resetEnvCacheForTests();
    expect(() => env()).toThrow(/not permitted when VERCEL_ENV=production/);
    process.env.VERCEL_ENV = "preview";
    process.env.HOSTAWAY_WRITE_TARGET = "production";
    resetEnvCacheForTests();
    expect(() => env()).toThrow(/only permitted when VERCEL_ENV=production/);
    process.env.VERCEL_ENV = "development";
    process.env.HOSTAWAY_WRITE_TARGET = "test";
    resetEnvCacheForTests();
  });
});
