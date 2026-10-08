#!/usr/bin/env node
/**
 * Copies the variables in .env.local into the linked Vercel project without ever
 * printing a value. Usage (after `vercel login` and `vercel link`):
 *   node scripts/vercel-env-push.mjs                 # production + preview
 *   node scripts/vercel-env-push.mjs --only production
 * Existing variables are replaced. Skips blank values and the keys Vercel sets itself.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SECRET = /SECRET|_KEY$|PASSWORD|TOKEN|SERVICE_ROLE|WEBHOOK_USER/;
const SKIP = new Set(["NODE_ENV", "VERCEL_ENV", "SUPABASE_DB_URL", "VERCEL_OIDC_TOKEN", "NEXT_PUBLIC_APP_URL"]);
const args = process.argv.slice(2);
const targets = args.includes("--only") ? [args[args.indexOf("--only") + 1]] : ["production", "preview"];
const overrides = Object.fromEntries(
  args.filter((a) => a.includes("=") && !a.startsWith("--")).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);

const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
const vars = {};
for (const line of lines) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  vars[m[1]] = v;
}
Object.assign(vars, overrides);

const run = (cmdArgs, input) =>
  spawnSync("npx", ["vercel", ...cmdArgs], { input, encoding: "utf8", shell: true, stdio: ["pipe", "pipe", "pipe"] });

let set = 0;
for (const [key, value] of Object.entries(vars)) {
  if (SKIP.has(key) || value === "") {
    console.log(`  skip ${key}`);
    continue;
  }
  for (const target of targets) {
    run(["env", "rm", key, target, "--yes"]); // ignore "not found"
    // NEXT_PUBLIC_* and plain config must be readable at build time (Next inlines them);
    // only real secrets are stored as Vercel "sensitive" values.
    const flag = !key.startsWith("NEXT_PUBLIC_") && SECRET.test(key) ? "--sensitive" : "--no-sensitive";
    const r = run(["env", "add", key, target, flag], value);
    if (r.status !== 0) {
      console.error(`  ✗ ${key} (${target}): ${(r.stderr || r.stdout).split("\n").slice(-3).join(" ").trim()}`);
      process.exitCode = 1;
    } else {
      set++;
      console.log(`  ✓ ${key} (${target})`);
    }
  }
}
console.log(`\n${set} values set across ${targets.join(", ")}.`);
