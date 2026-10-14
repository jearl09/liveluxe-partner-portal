import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// Renamed on import: the rules-of-hooks lint reads any use* call in a loop as a React hook.
import { THEMES, settle, useTheme as applyTheme } from "./theme";

/**
 * Brief §10.2 / §12.4: axe on every signed-in route in both themes, zero critical and zero
 * serious. Signs in once per role with test accounts from the environment (never committed):
 *
 *   E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD   a partner administrator
 *   E2E_OPS_EMAIL / E2E_OPS_PASSWORD           a Live Luxe operations user
 *
 * Without them the spec skips. Detail routes are found by following the first link on their
 * list page, so the spec needs no fixed ids. Moderate and minor findings are printed, not failed.
 */
const ROLES = {
  anon: { email: "-", password: "-", home: "/login" },
  partner: { email: process.env.E2E_PARTNER_EMAIL, password: process.env.E2E_PARTNER_PASSWORD, home: "/" },
  ops: { email: process.env.E2E_OPS_EMAIL, password: process.env.E2E_OPS_PASSWORD, home: "/admin/queue" },
} as const;
type Role = keyof typeof ROLES;

function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7) + 14);
  return d.toISOString().slice(0, 10);
}
const plus = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const checkIn = nextMonday();

/** A route, or a list page plus the href pattern of the first detail link to follow. */
type Target = { name: string; path: string; follow?: RegExp };
const ROUTES: Record<Role, Target[]> = {
  anon: [
    { name: "reset password", path: "/reset-password" },
    { name: "invitation (expired link)", path: "/invite/not-a-real-token" },
  ],
  partner: [
    { name: "dashboard", path: "/" },
    { name: "search (no dates)", path: "/search" },
    { name: "search (with dates)", path: `/search?checkIn=${checkIn}&checkOut=${plus(checkIn, 30)}&guests=2` },
    {
      name: "property",
      path: `/search?checkIn=${checkIn}&checkOut=${plus(checkIn, 30)}&guests=2`,
      follow: /^\/listings\/[^/?]+/,
    },
    { name: "requests", path: "/requests" },
    { name: "request detail", path: "/requests", follow: /^\/requests\/[0-9a-f-]{36}$/ },
    { name: "invoices", path: "/invoices" },
    { name: "team", path: "/team" },
    { name: "settings", path: "/settings" },
  ],
  ops: [
    { name: "queue", path: "/admin/queue" },
    { name: "bookings", path: "/admin/bookings" },
    { name: "booking detail", path: "/admin/bookings", follow: /^\/admin\/bookings\/[0-9a-f-]{36}$/ },
    { name: "partners", path: "/admin/partners" },
    // Partners and rate cards need partners.manage / rate_cards.manage; for an operations-only
    // account they redirect to the queue and the test is skipped, not failed.
    { name: "partner detail", path: "/admin/partners", follow: /^\/admin\/partners\/[0-9a-f-]{36}$/ },
    { name: "rate cards", path: "/admin/rate-cards" },
    { name: "rate card detail", path: "/admin/rate-cards", follow: /^\/admin\/rate-cards\/[0-9a-f-]{36}$/ },
    { name: "settings", path: "/admin/settings" },
  ],
};

const statePath = (role: Role) => `test-results/.auth-${role}.json`;

async function signIn(browser: Browser, role: Role) {
  const { email, password, home } = ROLES[role];
  const ctx = await browser.newContext();
  if (role === "anon") {
    await ctx.storageState({ path: statePath(role) });
    return ctx.close();
  }
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.goto(home);
  await ctx.storageState({ path: statePath(role) });
  await ctx.close();
}

async function resolve(page: Page, t: Target): Promise<string | null> {
  if (!t.follow) return t.path;
  await page.goto(t.path, { waitUntil: "networkidle" });
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.find((h) => t.follow!.test(h)) ?? null;
}

for (const role of Object.keys(ROUTES) as Role[]) {
  test.describe(`axe · ${role} routes`, () => {
    test.skip(!ROLES[role].email || !ROLES[role].password, `set E2E_${role.toUpperCase()}_EMAIL / _PASSWORD`);
    test.beforeAll(async ({ browser }) => signIn(browser, role));

    for (const t of ROUTES[role]) {
      test(t.name, async ({ browser }) => {
        test.setTimeout(90_000);
        const report: string[] = [];
        for (const theme of THEMES) {
          const ctx = await browser.newContext({ storageState: statePath(role) });
          const page = await ctx.newPage();
          await applyTheme(page, theme);
          const url = await resolve(page, t);
          test.skip(!url, `no link to follow on ${t.path}`);
          await page.goto(url!, { waitUntil: "networkidle" });
          if (role !== "anon") await expect(page).not.toHaveURL(/\/login/);
          const landed = new URL(page.url()).pathname;
          test.skip(
            t.path !== landed && !t.follow && landed === ROLES[role].home,
            `${t.path} redirected to ${landed}: this account cannot open it`,
          );
          await settle(page);
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
            .analyze();
          for (const v of results.violations) {
            const line = `[${theme}] ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
              .slice(0, 5)
              .map((n) => n.target.join(" "))
              .join("\n    ")}`;
            if (v.impact === "critical" || v.impact === "serious") report.push(line);
            else console.log(`  note ${t.name} ${line}`);
          }
          await ctx.close();
        }
        expect(report.join("\n")).toBe("");
      });
    }
  });
}
