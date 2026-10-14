#!/usr/bin/env node
/**
 * Phase 0 / Phase 2 screenshot capture for the UI/UX redesign (brief §12.1 step 3, §12.3).
 * Every route in docs/ux/ROUTE_MAP.md, both themes, 390 / 1024 / 1440 px, full page.
 *
 *   node scripts/ux-screenshots.mjs before     # → docs/ux/before/<route>/<theme>-<width>.png
 *   node scripts/ux-screenshots.mjs after      # → docs/ux/after/...
 *
 * Needs a running app (BASE_URL, default http://localhost:3000) and two test accounts in
 * the environment: UX_PARTNER_EMAIL / UX_PARTNER_PASSWORD and UX_OPS_EMAIL / UX_OPS_PASSWORD.
 * Record ids for dynamic routes come from UX_IDS_JSON (see docs/ux/before/INDEX.md).
 * Nothing here writes to the database: every captured route is a GET.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const phase = process.argv[2] === "after" ? "after" : "before";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join("docs", "ux", phase);
const WIDTHS = [390, 1024, 1440];
const THEMES = ["dark", "light"];
const ids = JSON.parse(process.env.UX_IDS_JSON ?? "{}");
const only = process.env.UX_ONLY ? new Set(process.env.UX_ONLY.split(",")) : null;

const partner = { email: process.env.UX_PARTNER_EMAIL, password: process.env.UX_PARTNER_PASSWORD };
const ops = { email: process.env.UX_OPS_EMAIL, password: process.env.UX_OPS_PASSWORD };
if (!partner.email || !ops.email) {
  console.error("Set UX_PARTNER_EMAIL/UX_PARTNER_PASSWORD and UX_OPS_EMAIL/UX_OPS_PASSWORD.");
  process.exit(1);
}

const L = ids.listing ?? "";
const R = ids.requestApproved ?? "";
const RC = ids.requestCancelled ?? "";
const RD = ids.requestDeclined ?? "";
const ORG = ids.org ?? "";
const RS = ids.requestSubmitted ?? "";
const RN = ids.requestNoCard ?? "";
const RCF = ids.requestConfirmed ?? "";
const dates = "checkIn=2026-11-25&checkOut=2026-11-30";

/** [slug, path, who] */
const ROUTES = [
  ["login", "/login", "anon"],
  ["login-error", "/login?error=invalid", "anon"],
  ["reset-password", "/reset-password", "anon"],
  ["reset-password-confirm", "/reset-password/confirm", "anon"],
  ["invite-token-invalid", "/invite/not-a-real-token", "anon"],
  ["not-found", "/this-page-does-not-exist", "anon"],

  ["dashboard", "/", "partner"],
  ["search", "/search", "partner"],
  ["search-dates", `/search?${dates}&guests=2&pets=0&q=Docklands`, "partner"],
  ["listing", `/listings/${L}`, "partner"],
  ["listing-priced", `/listings/${L}?${dates}&adults=2&guests=2&children=0&pets=0`, "partner"],
  ["requests", "/requests", "partner"],
  ["request-approved", `/requests/${R}`, "partner"],
  ["request-cancelled", `/requests/${RC}`, "partner"],
  ["request-declined", `/requests/${RD}`, "partner"],
  ...(RS ? [["request-submitted", `/requests/${RS}`, "partner"]] : []),
  ...(RN ? [["request-no-card", `/requests/${RN}`, "partner"]] : []),
  ...(RCF ? [["request-confirmed", `/requests/${RCF}`, "partner"]] : []),
  ["request-new", `/requests/new?listingId=${L}&${dates}&adults=2&children=0&pets=0`, "partner"],
  ["request-pay", `/requests/${R}/pay`, "partner"],
  ["request-not-found", "/requests/00000000-0000-0000-0000-000000000000", "partner"],
  ["invoices", "/invoices", "partner"],
  ["team", "/team", "partner"],
  ["settings", "/settings", "partner"],

  ["admin-queue", "/admin/queue", "ops"],
  ["admin-bookings", "/admin/bookings", "ops"],
  ["admin-booking-approved", `/admin/bookings/${R}`, "ops"],
  ["admin-booking-cancelled", `/admin/bookings/${RC}`, "ops"],
  ...(RS ? [["admin-booking-submitted", `/admin/bookings/${RS}`, "ops"]] : []),
  ...(RCF ? [["admin-booking-confirmed", `/admin/bookings/${RCF}`, "ops"]] : []),
  ["admin-partners", "/admin/partners", "ops"],
  ["admin-partner", `/admin/partners/${ORG}`, "ops"],
  ["admin-rate-cards", "/admin/rate-cards", "ops"],
  ["admin-rate-card", `/admin/rate-cards/${ORG}`, "ops"],
  ["admin-settings", "/admin/settings", "ops"],
  ["admin-not-found", "/admin/this-page-does-not-exist", "ops"],
];

async function signIn(context, who) {
  const creds = who === "partner" ? partner : ops;
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill('input[name="email"]', creds.email);
  await page.fill('input[name="password"]', creds.password);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);
  if (page.url().includes("/login")) throw new Error(`sign-in failed for ${who}: ${page.url()}`);
  await page.close();
}

const browser = await chromium.launch();
const index = [];
const failures = [];
try {
  for (const theme of THEMES) {
    for (const who of ["anon", "partner", "ops"]) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 900 } });
      if (who !== "anon") await signIn(context, who);
      const page = await context.newPage();
      for (const [slug, route, owner] of ROUTES) {
        if (owner !== who) continue;
        if (only && !only.has(slug)) continue;
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
          const file = path.join(OUT, slug, `${theme}-${width}.png`);
          mkdirSync(path.dirname(file), { recursive: true });
          try {
            await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 120_000 });
            await page.waitForTimeout(400);
            await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
            index.push({ slug, route, theme, width, file: file.replace(/\\/g, "/"), finalUrl: page.url() });
            process.stdout.write(`${theme} ${width} ${slug}\n`);
          } catch (e) {
            failures.push({ slug, route, theme, width, error: String(e).split("\n")[0] });
            process.stdout.write(`FAIL ${theme} ${width} ${slug}: ${String(e).split("\n")[0]}\n`);
          }
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const lines = [
  `# ${phase === "before" ? "Before" : "After"} screenshots — index`,
  "",
  `Captured ${new Date().toISOString()} against ${BASE}. Themes via \`prefers-color-scheme\` emulation; widths 390 / 1024 / 1440; full page.`,
  "",
  "| Route | Path | Dark 390 | Dark 1024 | Dark 1440 | Light 390 | Light 1024 | Light 1440 |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
];
const bySlug = new Map();
for (const e of index) {
  if (!bySlug.has(e.slug)) bySlug.set(e.slug, { route: e.route, shots: {} });
  bySlug.get(e.slug).shots[`${e.theme}-${e.width}`] = e.file.replace(`docs/ux/${phase}/`, "");
}
for (const [slug, { route, shots }] of bySlug) {
  const cell = (k) => (shots[k] ? `[png](${shots[k]})` : "—");
  lines.push(
    `| ${slug} | \`${route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "…")}\` | ${cell("dark-390")} | ${cell("dark-1024")} | ${cell("dark-1440")} | ${cell("light-390")} | ${cell("light-1024")} | ${cell("light-1440")} |`,
  );
}
if (failures.length) {
  lines.push("", "## Failed captures", "");
  for (const f of failures) lines.push(`- ${f.slug} ${f.theme} ${f.width}: ${f.error}`);
}
lines.push("", "Record ids used for dynamic routes are not committed; see DECISIONS.md #12.");
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "INDEX.md"), lines.join("\n") + "\n");
console.log(`done: ${index.length} screenshots, ${failures.length} failures → ${OUT}/INDEX.md`);
