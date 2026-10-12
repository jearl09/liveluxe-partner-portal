import type { Page } from "@playwright/test";

export type Theme = "light" | "dark";
export const THEMES: Theme[] = ["light", "dark"];

/**
 * Forces a theme the way a user would have chosen it: the stored preference is in
 * place before the first script runs, so the inline theme script applies it before
 * paint and there is no flash to screenshot. `system` is also exercised by emulating
 * the OS preference without a stored choice.
 */
export async function useTheme(page: Page, theme: Theme, via: "stored" | "system" = "stored") {
  if (via === "stored") {
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("livluxe.theme", t);
      } catch {
        /* storage blocked: the page falls back to system */
      }
    }, theme);
  } else {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("livluxe.theme");
      } catch {
        /* ignore */
      }
    });
    await page.emulateMedia({ colorScheme: theme });
  }
}

/** Waits for web fonts and one animation frame, so text metrics are final before a screenshot or an axe run. */
export async function settle(page: Page) {
  // The Next dev-tools badge is fixed to the viewport and would land mid-page in a full-page capture.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
