import { test, expect } from "@playwright/test";

/** Pending state on submit: immediate feedback, and a second press cannot send a second request. */
test.describe("submit buttons", () => {
  test("sign-in shows it is working and ignores a second submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("someone@example.com");
    await page.getByLabel("Password", { exact: true }).fill("not-the-password-123");

    let posts = 0;
    await page.route("**/api/auth/sign-in", async (route) => {
      posts += 1;
      // Hold the request so the pending state has time to show, then let the real handler bounce it
      // (WebKit cannot fulfil a navigation with a redirect, so the reply has to be the real one).
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });

    const button = page.getByRole("button", { name: "Sign in" });
    // Before hydration the form still posts natively; the pending state needs the client guard in place.
    await expect(button).toHaveAttribute("data-ready", "");

    // Playwright cannot read the DOM while a form navigation is in flight, so the page records
    // what the button looked like — and tries a second submit — and leaves the notes in
    // sessionStorage, which survives the redirect.
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>("button[type=submit]")!;
      const form = btn.form!;
      let submits = 0;
      form.addEventListener("submit", () => sessionStorage.setItem("e2e:submits", String(++submits)));
      new MutationObserver(() => {
        if (!btn.disabled || sessionStorage.getItem("e2e:pending")) return;
        sessionStorage.setItem(
          "e2e:pending",
          JSON.stringify({ text: btn.textContent, disabled: btn.disabled, busy: btn.getAttribute("aria-busy") }),
        );
        form.requestSubmit(); // a second submit while busy
      }).observe(btn, { attributes: true, childList: true, subtree: true });
    });

    await button.click();
    await expect(page.getByText("Email or password not recognised.")).toBeVisible();

    const seen = await page.evaluate(() => ({
      pending: JSON.parse(sessionStorage.getItem("e2e:pending") ?? "null") as {
        text: string;
        disabled: boolean;
        busy: string | null;
      } | null,
      submits: Number(sessionStorage.getItem("e2e:submits")),
    }));
    expect(seen.pending?.text).toMatch(/Signing in/);
    expect(seen.pending?.disabled).toBe(true);
    expect(seen.pending?.busy).toBe("true");
    expect(seen.submits, "the second submit reached the form").toBe(2);
    expect(posts, "but only one request left the browser").toBe(1);
  });

  test("a one-shot error message does not survive a refresh", async ({ page }) => {
    await page.goto("/login?error=invalid");
    await expect(page.getByText("Email or password not recognised.")).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.search)).toBe("");
    await page.reload();
    await expect(page.getByText("Email or password not recognised.")).toHaveCount(0);
  });

  test("persistent parameters are left alone", async ({ page }) => {
    await page.goto("/login?next=%2Frequests&error=invalid");
    await expect.poll(() => page.evaluate(() => location.search)).toBe("?next=%2Frequests");
  });
});
