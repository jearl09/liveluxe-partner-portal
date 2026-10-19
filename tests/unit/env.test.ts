import { afterEach, describe, expect, it } from "vitest";
import { approvalConfigBlock, env, resetEnvCacheForTests } from "@/lib/env";

const saved = { ...process.env };

function setEnv(over: Record<string, string | undefined>) {
  process.env = { ...saved, ...over };
  resetEnvCacheForTests();
}

afterEach(() => {
  process.env = saved;
  resetEnvCacheForTests();
});

describe("env(): Stripe key pair", () => {
  it("refuses a live secret key with a test publishable key", () => {
    setEnv({ STRIPE_SECRET_KEY: "rk_live_x", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x" });
    expect(() => env()).toThrow(/live-mode key.*test-mode/);
  });
  it("refuses a test secret key with a live publishable key", () => {
    setEnv({ STRIPE_SECRET_KEY: "sk_test_x", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x" });
    expect(() => env()).toThrow(/test-mode key.*live-mode/);
  });
  it("accepts matching pairs, including a restricted live key", () => {
    setEnv({ STRIPE_SECRET_KEY: "sk_test_x", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x" });
    expect(env().STRIPE_SECRET_KEY).toBe("sk_test_x");
    setEnv({ STRIPE_SECRET_KEY: "rk_live_x", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x" });
    expect(env().STRIPE_SECRET_KEY).toBe("rk_live_x");
  });
  it("still refuses to start without a webhook secret", () => {
    setEnv({ STRIPE_WEBHOOK_SECRET: "" });
    expect(() => env()).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});

describe("approvalConfigBlock()", () => {
  const live = { STRIPE_SECRET_KEY: "rk_live_x", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x" };

  it("blocks approval when Stripe is live and Hostaway writes are off", () => {
    setEnv({ ...live, VERCEL_ENV: "production", HOSTAWAY_ALLOW_WRITES: "false" });
    expect(approvalConfigBlock()).toMatch(/Hostaway writes are off/);
  });
  it("blocks when writes are 'on' but the environment is not production (writes are refused there)", () => {
    setEnv({ ...live, VERCEL_ENV: "preview", HOSTAWAY_ALLOW_WRITES: "false" });
    expect(approvalConfigBlock()).not.toBeNull();
  });
  it("allows approval once writes are on in production", () => {
    setEnv({ ...live, VERCEL_ENV: "production", HOSTAWAY_ALLOW_WRITES: "true", HOSTAWAY_WRITE_TARGET: "production" });
    expect(approvalConfigBlock()).toBeNull();
  });
  it("allows approval on test keys with writes off (Stage 1)", () => {
    setEnv({
      STRIPE_SECRET_KEY: "sk_test_x",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
      VERCEL_ENV: "production",
      HOSTAWAY_ALLOW_WRITES: "false",
    });
    expect(approvalConfigBlock()).toBeNull();
  });
});

describe("env(): Hostaway write guard", () => {
  it("refuses HOSTAWAY_ALLOW_WRITES=true outside production", () => {
    setEnv({ VERCEL_ENV: "preview", HOSTAWAY_ALLOW_WRITES: "true", HOSTAWAY_WRITE_TARGET: "production" });
    expect(() => env()).toThrow(/only permitted when VERCEL_ENV=production/);
    setEnv({ VERCEL_ENV: "development", HOSTAWAY_ALLOW_WRITES: "true", HOSTAWAY_WRITE_TARGET: "production" });
    expect(() => env()).toThrow(/only permitted when VERCEL_ENV=production/);
  });
  it("refuses the test write target in production", () => {
    setEnv({
      VERCEL_ENV: "production",
      HOSTAWAY_ALLOW_WRITES: "true",
      HOSTAWAY_WRITE_TARGET: "test",
      HOSTAWAY_TEST_ACCOUNT_ID: "12345",
    });
    expect(() => env()).toThrow(/not permitted when VERCEL_ENV=production/);
  });
});
