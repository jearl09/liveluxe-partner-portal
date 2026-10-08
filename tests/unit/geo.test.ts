import { describe, it, expect } from "vitest";
import { distanceMetres, fnv1a, jitterPoint, toEwktPoint } from "@/lib/domain/geo";

const docklands = { lat: -37.8149, lng: 144.9461 };

describe("geom_public jitter (spec §6.6)", () => {
  it("is deterministic for the same seed", () => {
    expect(jitterPoint(docklands, "listing:1")).toEqual(jitterPoint(docklands, "listing:1"));
  });

  it("differs between seeds", () => {
    expect(jitterPoint(docklands, "listing:1")).not.toEqual(jitterPoint(docklands, "listing:2"));
  });

  it("moves the pin by 100–200 m", () => {
    for (let i = 0; i < 200; i++) {
      const moved = jitterPoint(docklands, `listing:${i}`);
      const d = distanceMetres(docklands, moved);
      expect(d).toBeGreaterThanOrEqual(99);
      expect(d).toBeLessThanOrEqual(201);
    }
  });

  it("hashes stably", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });

  it("formats EWKT as lng lat", () => {
    expect(toEwktPoint(docklands)).toBe("SRID=4326;POINT(144.9461 -37.8149)");
  });
});
