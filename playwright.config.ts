import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a running app (local dev server or a Vercel preview URL via BASE_URL). Spec §20.
 *
 * Projects:
 *  - desktop-chromium / mobile-390: the functional smoke and accessibility specs.
 *  - visual: `kit.spec.ts` only — screenshots of the component gallery in both themes
 *    at 1366 / 820 / 390. The spec sets its own viewport per test, so it runs once.
 *    Baselines are platform-specific and live beside the spec; create them on the
 *    machine that will run the comparison with `npm run test:e2e -- --update-snapshots`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // A machine with a system Chromium and no browser downloads (some CI images) can point here;
    // the phone project then runs on Chromium too, since there is no WebKit to borrow.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } }
      : {}),
  },
  expect: {
    toHaveScreenshot: {
      // An absolute budget, not a ratio: on a full-page capture even a changed button is well under 1 %.
      // `threshold` is the per-pixel colour tolerance that absorbs antialiasing jitter.
      maxDiffPixels: 120,
      threshold: 0.25,
      animations: "disabled",
      caret: "hide",
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /kit\.spec\.ts/ },
    // §20 scenario 20: full flow on 390 px. The axe spec runs on desktop; mobile covers the smoke flows.
    {
      name: "mobile-390",
      use: {
        ...devices["iPhone 13"],
        ...(process.env.PW_CHROMIUM_PATH ? { defaultBrowserType: "chromium" as const } : {}),
      },
      testIgnore: /(kit|a11y)\.spec\.ts/,
    },
    { name: "visual", use: { ...devices["Desktop Chrome"] }, testMatch: /kit\.spec\.ts/ },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
