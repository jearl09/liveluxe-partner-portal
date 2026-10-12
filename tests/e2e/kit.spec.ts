import { test, expect } from "@playwright/test";
import { THEMES, settle, useTheme } from "./theme";

/**
 * Visual regression for every shared component: the design-review gallery at
 * /dev/kit, in both themes, at desktop, tablet and phone widths. The gallery renders
 * production components with fixed sample data, so a change to a button, pill,
 * panel, table or form shows up here before it shows up to a partner.
 *
 * Baselines live in tests/e2e/kit.spec.ts-snapshots/ and are platform-specific;
 * generate them with `npm run test:e2e -- --update-snapshots --project visual`.
 */
const WIDTHS = [
  { name: "desktop", width: 1366 },
  { name: "tablet", width: 820 },
  { name: "phone", width: 390 },
] as const;

test.describe("component kit", () => {
  for (const theme of THEMES) {
    for (const { name, width } of WIDTHS) {
      for (const tone of ["partner", "admin"] as const) {
        test(`${tone} shell · ${theme} · ${name} (${width}px)`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await useTheme(page, theme);
          const res = await page.goto(tone === "admin" ? "/dev/kit?tone=admin" : "/dev/kit", {
            waitUntil: "networkidle",
          });
          expect(res?.status(), "the gallery must be reachable outside production").toBe(200);
          await expect(page.getByRole("heading", { name: "Component kit" })).toBeVisible();
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await settle(page);

          // Nothing may spill past the viewport: a sideways-scrolling page on a phone is a layout bug.
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

          await expect(page).toHaveScreenshot(`kit-${tone}-${theme}-${name}.png`, {
            fullPage: true,
            // Clock-relative labels ("Due in 2 h 11 m", "Updated just now") are masked, not frozen.
            mask: [page.locator("[data-live]")],
          });
        });
      }
    }
  }

  test("system preference is honoured when nothing is stored", async ({ page }) => {
    await useTheme(page, "dark", "system");
    await page.goto("/dev/kit");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe("rgb(250, 247, 241)"); // the light canvas
  });
});
