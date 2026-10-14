import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

async function load() {
  vi.resetModules();
  return import("@/lib/security/access-crypto");
}

describe("access-crypto (spec 8.4 encryption at rest)", () => {
  const original = process.env.ACCESS_DETAILS_KEY;
  beforeEach(() => {
    process.env.ACCESS_DETAILS_KEY = KEY_HEX;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ACCESS_DETAILS_KEY;
    else process.env.ACCESS_DETAILS_KEY = original;
  });

  it("round-trips through the PostgREST bytea literal form", async () => {
    const { encryptSecret, decryptSecret, accessKeyConfigured } = await load();
    expect(accessKeyConfigured()).toBe(true);
    const blob = encryptSecret("4471#");
    expect(blob).toMatch(/^\\x[0-9a-f]+$/);
    expect(blob).not.toContain("4471");
    expect(decryptSecret(blob)).toBe("4471#");
  });

  it("uses a fresh IV every time", async () => {
    const { encryptSecret } = await load();
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("accepts a base64 key too", async () => {
    process.env.ACCESS_DETAILS_KEY = Buffer.from(KEY_HEX, "hex").toString("base64");
    const { encryptSecret, decryptSecret } = await load();
    expect(decryptSecret(encryptSecret("wifi-pass"))).toBe("wifi-pass");
  });

  it("refuses a key of the wrong length", async () => {
    process.env.ACCESS_DETAILS_KEY = "tooshort-tooshort-tooshort-tooshort";
    const { encryptSecret } = await load();
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });

  it("stores nothing and reads nothing without a key", async () => {
    delete process.env.ACCESS_DETAILS_KEY;
    const { encryptSecret, decryptSecret, accessKeyConfigured } = await load();
    expect(accessKeyConfigured()).toBe(false);
    expect(encryptSecret("x")).toBeNull();
    expect(decryptSecret("\\x00")).toBeNull();
  });

  it("returns null for a tampered or foreign blob instead of throwing", async () => {
    const { encryptSecret, decryptSecret } = await load();
    const blob = encryptSecret("secret")!;
    const tampered = blob.slice(0, -2) + (blob.endsWith("00") ? "11" : "00");
    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret("\\xdeadbeef")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });
});
