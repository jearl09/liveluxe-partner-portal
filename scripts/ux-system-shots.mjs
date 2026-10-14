#!/usr/bin/env node
/**
 * Screenshots /dev/system (the Phase 1 component gallery) in both themes at 390 and
 * 1440 px into docs/ux/after/dev-system/. Needs a running app (BASE_URL).
 *   node scripts/ux-system-shots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/ux/after/dev-system";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem("livluxe.theme", t), theme);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto(`${BASE}/dev/system`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${theme}-${width}.png`, fullPage: true, animations: "disabled" });
    console.log(`${theme} ${width}`);
  }
  await context.close();
}
await browser.close();
