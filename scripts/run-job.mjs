#!/usr/bin/env node
/**
 * Trigger a scheduled job against a running dev server, the way Vercel Cron would:
 *   node scripts/run-job.mjs sync-listings
 *   node scripts/run-job.mjs sync-calendar-near
 * Reads CRON_SECRET and NEXT_PUBLIC_APP_URL from .env.local (never printed).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const job = process.argv[2];
const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!job || !secret) {
  console.error("usage: node scripts/run-job.mjs <job-name>   (needs CRON_SECRET in .env.local)");
  process.exit(2);
}

const started = Date.now();
console.log(`→ POST ${base}/api/cron/${job}`);
let res;
try {
  res = await fetch(`${base}/api/cron/${job}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(320_000),
  });
} catch (e) {
  console.error(
    `✗ request failed after ${((Date.now() - started) / 1000).toFixed(1)} s: ${e?.cause?.message ?? e.message}`,
  );
  console.error("  The job may still be running on the server; check sync_runs before re-triggering.");
  process.exit(1);
}
const body = await res.json().catch(() => ({}));
console.log(`← HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(JSON.stringify(body, null, 2));
process.exit(res.ok && body.status !== "failed" ? 0 : 1);
