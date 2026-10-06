/**
 * Opaque one-time tokens for invitation links (spec §8.1).
 * The plaintext travels only in the emailed URL; the database stores SHA-256(token).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits of entropy, URL-safe, no padding. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Only accepts tokens shaped like ours, so junk never reaches the database. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
