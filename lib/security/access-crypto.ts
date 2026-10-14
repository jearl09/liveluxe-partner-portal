/**
 * Encryption at rest for door codes, Wi-Fi passwords and entry instructions
 * (spec §8.4, §16.3). AES-256-GCM with a key that lives only in the environment
 * (ACCESS_DETAILS_KEY: 32 bytes, hex or base64). The database holds
 * iv ‖ auth tag ‖ ciphertext as bytea, so a database dump alone reveals nothing.
 *
 * Without a key the sync still runs; it simply stores no secrets and the pack
 * tells the partner to call for the code. Never log a plaintext here.
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFromEnv(): Buffer | null {
  const raw = process.env.ACCESS_DETAILS_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ACCESS_DETAILS_KEY must be 32 bytes (64 hex chars or base64)");
  return buf;
}

export function accessKeyConfigured(): boolean {
  return keyFromEnv() !== null;
}

/** Encrypt for storage. Returns the PostgREST bytea literal (`\x…`), or null without a key or value. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const key = keyFromEnv();
  if (!key) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "\\x" + Buffer.concat([iv, tag, body]).toString("hex");
}

/** Decrypt a stored value. Returns null for null, an unreadable blob or a missing key (never throws). */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const key = keyFromEnv();
  if (!key) return null;
  try {
    const hex = stored.startsWith("\\x") ? stored.slice(2) : stored;
    const buf = Buffer.from(hex, "hex");
    if (buf.length < IV_BYTES + TAG_BYTES) return null;
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = buf.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
