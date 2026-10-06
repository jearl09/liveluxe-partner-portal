import { describe, it, expect, vi } from "vitest";
import { generateToken, hashToken, hashesEqual, isWellFormedToken } from "@/lib/auth/tokens";
import { isPasswordBreached } from "@/lib/auth/hibp";

describe("invitation tokens", () => {
  it("generates 43-char base64url tokens that hash to 64 hex chars", () => {
    const t = generateToken();
    expect(isWellFormedToken(t)).toBe(true);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashesEqual(hashToken(t), hashToken(t))).toBe(true);
    expect(hashesEqual(hashToken(t), hashToken(generateToken()))).toBe(false);
  });
  it("rejects malformed tokens before they reach the database", () => {
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken("abc")).toBe(false);
    expect(isWellFormedToken("a".repeat(43) + "!")).toBe(false);
    expect(isWellFormedToken(42)).toBe(false);
  });
});

describe("HIBP range check (k-anonymity)", () => {
  // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  it("flags a known-breached password using only the 5-char prefix", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.pwnedpasswords.com/range/5BAA6");
      return new Response("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n", {
        status: 200,
      });
    });
    const r = await isPasswordBreached("password", fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ breached: true, count: 3861493, checked: true });
  });
  it("passes an unlisted password", async () => {
    const fetchMock = vi.fn(async () => new Response("0018A45C4D1DEF81644B54AB7F969B88D65:1\n", { status: 200 }));
    const r = await isPasswordBreached("password", fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ breached: false, count: 0, checked: true });
  });
  it("fails open when HIBP is unreachable, but reports that it did not check", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await isPasswordBreached("password", fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ breached: false, count: 0, checked: false });
  });
});
