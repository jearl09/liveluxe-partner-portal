#!/usr/bin/env node
/**
 * Screenshots /dev/system (the Phase 1 gallery) in both themes at 390 and 1440 px,
 * plus each overlay opened (date range picker, sheet, confirm dialog, manual search),
 * into docs/ux/after/dev-system/. Needs a running app (BASE_URL).
 *   node scripts/ux-system-shots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/ux/after/dev-system";
mkdirSync(OUT, { recursive: true });

const OVERLAYS = [
  [
    "date-range",
    (p) =>
      p
        .getByRole("button", { name: /Stay dates.*Wed 25 Nov 2026/ })
        .first()
        .click(),
  ],
  ["sheet", (p) => p.getByRole("button", { name: "New partner" }).click()],
  [
    "confirm-approve",
    (p) => p.getByRole("button", { name: "Approve", exact: true }).and(p.locator(":enabled")).click(),
  ],
  ["confirm-decline", (p) => p.getByRole("button", { name: "Decline", exact: true }).nth(1).click()],
  ["manual-search", (p) => p.getByRole("button", { name: "Ask us to find one" }).click()],
];

const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem("livluxe.theme", t), theme);
  for (const width of [390, 1440]) {
    const height = width < 700 ? 844 : 900;
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}/dev/system`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${theme}-${width}.png`, fullPage: true, animations: "disabled" });
    for (const [name, open] of OVERLAYS) {
      await page.goto(`${BASE}/dev/system`, { waitUntil: "networkidle", timeout: 120_000 });
      await open(page);
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${OUT}/${name}-${theme}-${width}.png`, animations: "disabled" });
      await page.keyboard.press("Escape");
    }
    console.log(`${theme} ${width}`);
  }
  await context.close();
}
await browser.close();
