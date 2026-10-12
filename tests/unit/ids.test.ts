import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/domain/ids";

describe("isUuid", () => {
  it("accepts canonical UUIDs in either case", () => {
    expect(isUuid("6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("6F1C2D3E-4A5B-4C6D-8E9F-0A1B2C3D4E5F")).toBe(true);
  });
  it("rejects anything else, including near misses", () => {
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5")).toBe(false);
    expect(isUuid("6f1c2d3e4a5b4c6d8e9f0a1b2c3d4e5f")).toBe(false);
  });
});
