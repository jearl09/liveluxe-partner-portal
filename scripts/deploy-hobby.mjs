#!/usr/bin/env node
/**
 * Deploy to a Vercel HOBBY account (test links only). Hobby allows at most two cron
 * jobs, each at most once a day, so `vercel.json` (14 crons, the real schedule) is
 * swapped for a two-cron nightly config during the deploy and restored afterwards.
 *
 *   node scripts/deploy-hobby.mjs            # production deploy of the current tree
 *   node scripts/deploy-hobby.mjs --preview  # preview deploy
 *
 * The go-live deployment on the Pro team uses plain `vercel deploy --prod` with the
 * committed vercel.json. Trigger the other jobs by hand meanwhile:
 *   NEXT_PUBLIC_APP_URL=https://<app>.vercel.app node scripts/run-job.mjs sync-calendar-far
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const original = readFileSync("vercel.json", "utf8");
const cfg = JSON.parse(original);
cfg.crons = [
  { path: "/api/cron/sync-listings", schedule: "0 18 * * *" }, // 04:00 Melbourne (AEDT)
  { path: "/api/cron/sync-calendar-near", schedule: "30 18 * * *" },
];
writeFileSync("vercel.json", JSON.stringify(cfg, null, 2) + "\n");

const args = ["vercel", "deploy", "--yes", ...(process.argv.includes("--preview") ? [] : ["--prod"])];
let status = 1;
try {
  status = spawnSync("npx", args, { stdio: "inherit", shell: true }).status ?? 1;
} finally {
  writeFileSync("vercel.json", original);
  console.log("\nvercel.json restored to the committed schedule.");
}
process.exit(status);
