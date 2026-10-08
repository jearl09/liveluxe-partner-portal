/**
 * Geography helpers — spec §6.6 (geom_public: deterministic 100–200 m jitter).
 *
 * Partners see an approximate pin until a booking is approved, so the exact
 * address of an empty property is never discoverable from the map. The jitter
 * is a pure function of the listing id so the pin does not wander between syncs.
 */

const EARTH_RADIUS_M = 6_371_000;

/** Small, stable 32-bit hash (FNV-1a) — good enough to seed a jitter, not for security. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Offsets a point by 100–200 m in a direction derived from `seed`.
 * Same seed → same offset, always.
 */
export function jitterPoint(point: LatLng, seed: string, minMetres = 100, maxMetres = 200): LatLng {
  const h = fnv1a(seed);
  const bearing = ((h & 0xffff) / 0xffff) * 2 * Math.PI;
  const distance = minMetres + ((h >>> 16) / 0xffff) * (maxMetres - minMetres);
  const dLat = (distance * Math.cos(bearing)) / EARTH_RADIUS_M;
  const dLng = (distance * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos((point.lat * Math.PI) / 180));
  return {
    lat: round6(point.lat + (dLat * 180) / Math.PI),
    lng: round6(point.lng + (dLng * 180) / Math.PI),
  };
}

/** PostGIS-friendly EWKT literal for a geography(Point,4326) column. */
export function toEwktPoint(point: LatLng): string {
  return `SRID=4326;POINT(${point.lng} ${point.lat})`;
}

/** Great-circle distance in metres (haversine). Used by tests to pin the jitter radius. */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
