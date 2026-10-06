#!/usr/bin/env node
/**
 * CI guard (spec §8.3): the service-role client and the raw service-role key must
 * never be referenced from partner-facing or client-side code. Complements the ESLint
 * rule with a grep that cannot be disabled by an inline comment.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_DIRS = ["app/(portal)", "app/(marketing)", "components", "lib/domain"];
const PATTERNS = [/lib\/db\/admin/, /SUPABASE_SERVICE_ROLE_KEY/];
const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) {
      const src = readFileSync(p, "utf8");
      for (const re of PATTERNS) if (re.test(src)) violations.push(`${p}: matches ${re}`);
    }
  }
}

FORBIDDEN_DIRS.forEach(walk);

// Also: nothing under app/ or components/ marked "use client" may import server-only modules.
function walkClient(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkClient(p);
    else if (/\.(ts|tsx)$/.test(name)) {
      const src = readFileSync(p, "utf8");
      if (/^\s*["']use client["']/m.test(src) && /@\/lib\/(db\/admin|stripe\/client|hostaway\/)/.test(src)) {
        violations.push(`${p}: client component imports a server-only integration module`);
      }
    }
  }
}
walkClient("app");
walkClient("components");

if (violations.length) {
  console.error("Service-role / server-only guard FAILED:\n" + violations.map((v) => "  - " + v).join("\n"));
  process.exit(1);
}
console.log("Service-role guard passed.");
