import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("health endpoint responds", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).status).toBe("ok");
  });

  test("unauthenticated visitor is redirected to /login", async ({ page }) => {
    await page.goto("/search");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Partner sign in" })).toBeVisible();
  });

  test("cron endpoints reject requests without the shared secret", async ({ request }) => {
    const res = await request.post("/api/cron/expire-holds");
    expect(res.status()).toBe(401);
  });

  test("hostaway webhook rejects a wrong path secret", async ({ request }) => {
    const res = await request.post("/api/webhooks/hostaway/not-the-secret", { data: {} });
    expect(res.status()).toBe(401);
  });
});
