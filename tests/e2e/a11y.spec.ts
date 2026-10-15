import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { THEMES, settle, useTheme } from "./theme";

/**
 * Automated accessibility checks (WCAG 2.1 A/AA rules axe can verify: accessible
 * names, form labels, colour contrast, landmarks, ARIA validity). Runs against the
 * public sign-in screen and the component gallery — which renders every shared
 * component with sample data — in both themes, so a contrast regression in dark
 * mode fails here rather than in front of a partner.
 *
 * Nothing is disabled wholesale. If a rule ever has to be excluded, scope it to the
 * element and say why, next to the exclusion.
 */
async function audit(page: Page) {
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
}

function describeViolations(results: Awaited<ReturnType<typeof audit>>) {
  return results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)
    .join("\n");
}

test.describe("accessibility", () => {
  for (const theme of THEMES) {
    test(`sign-in screen · ${theme}`, async ({ page }) => {
      await useTheme(page, theme);
      await page.goto("/login");
      await settle(page);
      const results = await audit(page);
      expect(describeViolations(results)).toBe("");
    });

    test(`component gallery · ${theme}`, async ({ page }) => {
      await useTheme(page, theme);
      await page.goto("/dev/kit");
      await expect(page.getByRole("heading", { name: "Component kit" })).toBeVisible();
      await settle(page);
      const results = await audit(page);
      expect(describeViolations(results)).toBe("");
    });

    test(`component gallery, admin shell · ${theme}`, async ({ page }) => {
      await useTheme(page, theme);
      await page.goto("/dev/kit?tone=admin");
      await settle(page);
      const results = await audit(page);
      expect(describeViolations(results)).toBe("");
    });
  }

  test("error boundary shows the branded page, a working retry and no internals", async ({ page }) => {
    await page.goto("/dev/kit?throw=1");
    await expect(page.getByRole("heading", { name: "This page couldn't load" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    // Visible text only: the dev overlay's collapsed badge holds the thrown message, which a visitor never sees.
    await expect(
      page.getByText(/Deliberate preview error|at .*\.tsx|node_modules/).filter({ visible: true }),
    ).toHaveCount(0);
    await settle(page);
    const results = await audit(page);
    expect(describeViolations(results)).toBe("");
    // "Try again" re-renders the segment; with the cause still in the URL the page fails the same way, cleanly.
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "This page couldn't load" })).toBeVisible();
  });

  test("not-found page is reachable and accessible", async ({ page }) => {
    await page.goto("/login/this-does-not-exist");
    await expect(page.getByRole("heading", { name: "That page doesn't exist" })).toBeVisible();
    await settle(page);
    const results = await audit(page);
    expect(describeViolations(results)).toBe("");
  });
});
