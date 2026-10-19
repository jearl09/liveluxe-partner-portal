import { describe, expect, it } from "vitest";
import { approvalBlockedByConfig, stripeKeyMode, stripeKeyPairMismatch } from "@/lib/domain/approval-guard";

describe("stripeKeyMode", () => {
  it("reads the mode from secret, restricted and publishable keys", () => {
    expect(stripeKeyMode("sk_test_abc")).toBe("test");
    expect(stripeKeyMode("sk_live_abc")).toBe("live");
    expect(stripeKeyMode("rk_live_abc")).toBe("live");
    expect(stripeKeyMode("pk_test_abc")).toBe("test");
  });
  it("is unknown for anything else", () => {
    expect(stripeKeyMode("whsec_abc")).toBe("unknown");
    expect(stripeKeyMode("")).toBe("unknown");
    expect(stripeKeyMode(null)).toBe("unknown");
  });
});

describe("stripeKeyPairMismatch", () => {
  it("accepts a matching pair", () => {
    expect(stripeKeyPairMismatch("sk_test_a", "pk_test_b")).toBeNull();
    expect(stripeKeyPairMismatch("rk_live_a", "pk_live_b")).toBeNull();
  });
  it("refuses live with test, either way round", () => {
    expect(stripeKeyPairMismatch("rk_live_a", "pk_test_b")).toMatch(/live-mode key.*test-mode/);
    expect(stripeKeyPairMismatch("sk_test_a", "pk_live_b")).toMatch(/test-mode key.*live-mode/);
  });
  it("does not guess when a key's mode cannot be told", () => {
    expect(stripeKeyPairMismatch("sk_live_a", "not-a-key")).toBeNull();
  });
});

describe("approvalBlockedByConfig", () => {
  it("blocks live Stripe while Hostaway writes are off", () => {
    expect(approvalBlockedByConfig({ stripeSecretKey: "rk_live_a", hostawayWritesEnabled: false })).toMatch(
      /Hostaway writes are off/,
    );
    expect(approvalBlockedByConfig({ stripeSecretKey: "sk_live_a", hostawayWritesEnabled: false })).not.toBeNull();
  });
  it("allows live Stripe once writes are on", () => {
    expect(approvalBlockedByConfig({ stripeSecretKey: "rk_live_a", hostawayWritesEnabled: true })).toBeNull();
  });
  it("allows test Stripe whatever the write setting (Stage 1)", () => {
    expect(approvalBlockedByConfig({ stripeSecretKey: "sk_test_a", hostawayWritesEnabled: false })).toBeNull();
    expect(approvalBlockedByConfig({ stripeSecretKey: "sk_test_a", hostawayWritesEnabled: true })).toBeNull();
  });
});
