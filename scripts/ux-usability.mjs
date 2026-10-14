#!/usr/bin/env node
/**
 * First-time-user task tests (brief §13 "Test it"). Each step finds controls the way a
 * person would — by their visible words — and records a HUNT when the obvious words were
 * not there and a second look was needed, or a FAIL when the task could not continue.
 * Screenshots of each step go to UX_SHOTS (default: os tmp). Results print as JSON.
 *
 *   node scripts/ux-usability.mjs a b d e       # run the named tasks in order
 *
 * Needs a running app (BASE_URL) and UX_PARTNER_* / UX_OPS_* credentials. Task (a)
 * submits a real request with a Stripe TEST card; (d) and (e) approve and decline
 * the two most urgent requests. Run only against a development database.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.UX_SHOTS ?? path.join(os.tmpdir(), "ux-usability");
const WIDTH = Number(process.env.UX_WIDTH ?? 1440);
mkdirSync(SHOTS, { recursive: true });
const tasks = process.argv.slice(2);

const results = [];
let current;
function begin(id, title) {
  current = { id, title, started: Date.now(), steps: [], hunts: [], fails: [], notes: [] };
  results.push(current);
}
function end(outcome) {
  current.outcome = outcome;
  current.seconds = Math.round((Date.now() - current.started) / 1000);
}
const note = (n) => current.notes.push(n);
let shotN = 0;
async function shot(page, label) {
  const f = path.join(SHOTS, `${current.id}-${String(++shotN).padStart(2, "0")}-${label}.png`);
  await page.screenshot({ path: f });
  current.steps.push({ label, shot: f });
}

/** Try the obvious locator; if it is not there, try the fallbacks and log a hunt. */
async function find(page, what, candidates, timeout = 4000) {
  for (let i = 0; i < candidates.length; i++) {
    const loc = candidates[i](page).first();
    try {
      await loc.waitFor({ state: "visible", timeout: i === 0 ? timeout : 1500 });
      if (i > 0) current.hunts.push(`${what}: not found by its obvious words; found on try ${i + 1}`);
      return loc;
    } catch {
      /* next */
    }
  }
  current.fails.push(`${what}: could not find it`);
  throw new Error(`could not find ${what}`);
}

async function signIn(context, who) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(process.env[`UX_${who}_EMAIL`]);
  await page
    .getByLabel(/password/i)
    .first()
    .fill(process.env[`UX_${who}_PASSWORD`]);
  await Promise.all([page.waitForLoadState("networkidle"), page.getByRole("button", { name: /sign in/i }).click()]);
  return page;
}

function nextMonday(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const add = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}
const iso = (d) => d.toISOString().slice(0, 10);

/** Fill a stay range whichever control the page has: native date inputs or the calendar field. */
async function fillStay(page, checkIn, checkOut) {
  const native = page.locator('input[type="date"][name="checkIn"]');
  if (await native.count()) {
    await native.first().fill(checkIn);
    await page.locator('input[type="date"][name="checkOut"]').first().fill(checkOut);
    note("Dates are typed into two separate native date boxes; no night count shown while choosing.");
    return;
  }
  const trigger = await find(page, "the dates field", [
    (p) => p.getByRole("button", { name: /check-in and check-out|stay dates|dates/i }),
  ]);
  await trigger.click();
  const pick = async (isoDate) => {
    const d = new Date(`${isoDate}T00:00:00Z`);
    const label = d.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    for (let i = 0; i < 12; i++) {
      const day = page.getByRole("button", { name: new RegExp(label.replace(/,/g, ",?"), "i") });
      if (await day.count()) return day.first().click();
      const cell = page.locator(`[data-day="${isoDate}"] button`);
      if (await cell.count()) return cell.first().click();
      await page.getByRole("button", { name: /next month/i }).click();
    }
    current.fails.push(`could not find ${isoDate} in the calendar`);
  };
  await pick(checkIn);
  await pick(checkOut);
  const done = page.getByRole("button", { name: /^done$/i });
  if (await done.count()) await done.click();
}

// ---------------------------------------------------------------------------
const TASKS = {
  async a(browser, opts = {}) {
    begin("a", "Partner places a family of 4 in Docklands for 30 nights from next Monday with a claim reference");
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
    const page = await signIn(context, "PARTNER");
    await shot(page, "dashboard");
    const go = await find(page, "a way to start a search", [
      (p) => p.getByRole("link", { name: /find a property/i }),
      (p) => p.getByRole("link", { name: /^search$/i }),
    ]);
    await go.click();
    await page.waitForLoadState("networkidle");
    const where = await find(page, "the place field", [
      (p) => p.getByLabel(/suburb|location|where/i),
      (p) => p.getByPlaceholder(/docklands|suburb/i),
    ]);
    await where.fill("Docklands");
    // "a:+14" shifts the stay two weeks later, for a second test request on free dates.
    const shift = typeof opts.id === "string" && opts.id.startsWith("+") ? Number(opts.id.slice(1)) : 0;
    const start = new Date(nextMonday().getTime() + shift * 86_400_000);
    const checkIn = iso(start);
    const checkOut = iso(new Date(start.getTime() + 30 * 86_400_000));
    await fillStay(page, checkIn, checkOut);
    const guests = await find(page, "the guests field", [
      (p) => p.getByLabel(/^guests$/i),
      (p) => p.getByLabel(/adults/i),
    ]);
    await guests.fill("4");
    await shot(page, "search-filled");
    await (await find(page, "the Search button", [(p) => p.getByRole("button", { name: /^search$/i })])).click();
    await page.waitForLoadState("networkidle");
    await shot(page, "results");
    const results = page.locator("main a[href^='/listings/']");
    const n = await results.count();
    note(`${n} result links for ${checkIn} → ${checkOut}.`);
    if (!(await page.getByText(/30 nights/).count())) note("Result cards do not show the total for the 30 nights.");
    if (n === 0) {
      current.fails.push("no properties to choose from");
      return end("fail");
    }
    await results.nth(opts.pick ?? 0).click();
    await page.waitForLoadState("networkidle");
    await shot(page, "property");
    const getPrice = page.getByRole("button", { name: /get price/i });
    if (await getPrice.count()) {
      await getPrice.first().click();
      await page.waitForLoadState("networkidle");
      current.hunts.push(
        "Had to press Get price on the property page although the dates were already chosen in search.",
      );
      await shot(page, "priced");
    }
    if (await page.getByText(/not available/i).count()) {
      current.fails.push("the chosen property is not available for those dates");
      await shot(page, "unavailable");
      await context.close();
      return end("fail");
    }
    const req = await find(page, "the button to request this property", [
      (p) => p.getByRole("link", { name: /request this property/i }),
      (p) => p.getByRole("link", { name: /request to book/i }),
      (p) => p.getByRole("button", { name: /request/i }),
    ]);
    await req.click();
    await page.waitForLoadState("networkidle");
    await shot(page, "request-form");
    await (await find(page, "guest name", [(p) => p.getByLabel(/guest name/i)])).fill("Jordan Citizen");
    await (
      await find(page, "claim reference", [(p) => p.getByLabel(/claim reference/i)])
    ).fill(opts.claim ?? "CLM-2026-0101");
    const cont = page.getByRole("button", { name: /continue to review/i });
    if (await cont.count()) {
      await cont.first().click();
      await shot(page, "review");
    }
    const confirm = page.getByRole("checkbox");
    if (await confirm.count()) {
      await confirm.first().check();
      note("A confirmation checkbox must be ticked before submitting.");
    }
    await (
      await find(page, "the send button", [
        (p) => p.getByRole("button", { name: /send request/i }),
        (p) => p.getByRole("button", { name: /submit request/i }),
      ])
    ).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await page.waitForLoadState("load");
    await shot(page, "after-submit");
    if (/\/pay/.test(page.url())) {
      // Stripe's card field does not submit headless (USABILITY.md); the hold step is reached and that ends the task.
      const body = await page.locator("main").innerText();
      const ref = body.match(/LLX-\d{4}-\d{6}/)?.[0] ?? null;
      note(`Sent ${ref}; landed on the card-hold step (${page.url().replace(BASE, "").split("?")[0]}).`);
      if (!/one more step|hold your card/i.test(body))
        current.hunts.push("The card-hold page did not say the request was sent.");
      await context.close();
      return end(ref ? "pass" : "fail");
    }
    await shot(page, "request-page");
    const ref = (await page.locator("h1").first().textContent())?.trim();
    note(`Ended on ${page.url().replace(BASE, "")} with heading ${ref}.`);
    if (!(await page.getByText(/reply by|decide by|reviewing/i).count()))
      current.hunts.push("After submitting, the page did not say when Live Luxe will reply.");
    await context.close();
    end(ref?.startsWith("LLX-") ? "pass" : "fail");
  },

  /** Not a usability task: hold the test card on an existing request (h:<id>). */
  async h(browser, opts) {
    begin("h", `Hold a test card on request ${opts.id}`);
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
    const page = await signIn(context, "PARTNER");
    await page.goto(`${BASE}/requests/${opts.id}/pay`, { waitUntil: "load" });
    await page.locator('iframe[title*="Secure payment input frame"]').first().waitFor({ timeout: 60_000 });
    const frame = page.frameLocator('iframe[title*="Secure payment input frame"]').first();
    await frame.locator('input[name="number"]').fill("4242424242424242");
    await frame.locator('input[name="expiry"]').fill("12 / 30");
    await frame.locator('input[name="cvc"]').fill("123");
    const pc = frame.locator('input[name="postalCode"]');
    if (await pc.count()) await pc.fill("3000");
    await page.getByRole("button", { name: /place card hold|pay now/i }).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]+(\?|$)/, { timeout: 60_000 });
    await context.close();
    end("pass");
  },

  async b(browser) {
    begin("b", "Partner finds out when they'll get check-in details for an approved booking");
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
    const page = await signIn(context, "PARTNER");
    await (await find(page, "Requests in the menu", [(p) => p.getByRole("link", { name: /^requests$/i })])).click();
    await page.waitForLoadState("networkidle");
    await shot(page, "requests");
    const rowWith = (p) =>
      p
        .getByRole("row")
        .filter({ hasText: /approved|confirmed/i })
        .getByRole("link");
    let target = rowWith(page).first();
    if (!(await target.count())) {
      for (const tab of [/upcoming/i, /confirmed/i, /history|closed/i]) {
        const t = page.getByRole("link", { name: tab });
        if (await t.count()) {
          const href = await t.first().getAttribute("href");
          await t.first().click();
          if (href) await page.waitForURL((u) => u.pathname + u.search === href, { timeout: 15_000 }).catch(() => {});
          await page.waitForLoadState("networkidle");
          if (await rowWith(page).count()) {
            current.hunts.push(
              `The approved booking was not in the default list; found it under the "${(await t.first().textContent())?.trim()}" tab.`,
            );
            target = rowWith(page).first();
            break;
          }
        }
      }
    }
    if (!(await target.count())) {
      current.fails.push("no approved or confirmed booking found in any tab");
      await context.close();
      return end("fail");
    }
    await target.click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await page.locator("h1").first().waitFor();
    await shot(page, "booking");
    const answer = page.getByText(/door code and wi-?fi .*(arrive|ready|AEDT|AEST)/i);
    const visible = await answer
      .first()
      .isVisible()
      .catch(() => false);
    const box = visible ? await answer.first().boundingBox() : null;
    note(
      box
        ? `Answer found ${Math.round(box.y)} px from the top: "${(await answer.first().textContent())?.trim()}"`
        : "No sentence saying when check-in details arrive.",
    );
    if (box && box.y > 900) current.hunts.push("The answer is below the first screen; had to scroll.");
    await context.close();
    end(box ? "pass" : "fail");
  },

  async d(browser) {
    begin("d", "Ops approves the most urgent request");
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
    const page = await signIn(context, "OPS");
    await page.goto(`${BASE}/admin/queue`, { waitUntil: "networkidle" });
    await shot(page, "queue");
    // The most urgent request is the first row; Approve sits on it.
    const approve = await find(page, "Approve on the most urgent request", [
      (p) =>
        p
          .locator("li[data-tone]")
          .first()
          .getByRole("button", { name: /^approve$/i }),
      (p) => p.getByRole("button", { name: /^approve$/i }),
    ]);
    const ref = await page.locator("li[data-tone]").first().locator("[data-row-link]").innerText();
    await approve.click();
    await shot(page, "confirm-dialog");
    const confirmBtn = page.getByRole("dialog").getByRole("button", { name: /approve/i });
    if (await confirmBtn.count()) await confirmBtn.first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await shot(page, "after-approve");
    const toast = (
      await page
        .locator("ol li")
        .allInnerTexts()
        .catch(() => [])
    ).join(" ");
    note(`Back on ${new URL(page.url()).pathname}; confirmation: "${toast.replace(/\s+/g, " ").trim()}".`);
    const ok = /confirmed|approved/i.test(toast) && toast.includes(ref.split("\n")[0].trim());
    await context.close();
    end(ok ? "pass" : "fail");
  },

  async e(browser) {
    begin("e", "Ops declines a request with a reason");
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
    const page = await signIn(context, "OPS");
    await page.goto(`${BASE}/admin/queue`, { waitUntil: "networkidle" });
    await shot(page, "queue");
    const row = page.locator("li[data-tone]").first();
    const ref = (await row.locator("[data-row-link]").innerText()).split("\n")[0].trim();
    // A first-time user looks for Decline on the row; it is in the row's details.
    let decline = row.getByRole("button", { name: /^decline$/i });
    if (!(await decline.isVisible().catch(() => false))) {
      current.hunts.push("Decline is not on the row; opened the row's details to find it (one click).");
      await row.getByRole("button", { name: /show details/i }).click();
      decline = row.getByRole("button", { name: /^decline$/i });
      await decline.waitFor({ state: "visible", timeout: 3000 });
    }
    await decline.click();
    const dialog = page.getByRole("dialog");
    await (
      await find(page, "the reason list", [(p) => p.getByRole("dialog").getByLabel(/reason/i)])
    ).selectOption({ index: 1 });
    await dialog.getByLabel(/note/i).fill("Owner has blocked these dates; suggest 673 La Trobe 1010.");
    await shot(page, "decline-dialog");
    await dialog.getByRole("button", { name: /decline request/i }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await shot(page, "after-decline");
    const toast = (
      await page
        .locator("ol li")
        .allInnerTexts()
        .catch(() => [])
    ).join(" ");
    note(`Back on ${new URL(page.url()).pathname}; confirmation: "${toast.replace(/\s+/g, " ").trim()}".`);
    await context.close();
    end(/declined/i.test(toast) && toast.includes(ref) ? "pass" : "fail");
  },
};

const browser = await chromium.launch();
try {
  for (const t of tasks) {
    const [id, arg] = t.split(":");
    try {
      await TASKS[id](browser, {
        id: arg,
        pick: arg && /^\d+$/.test(arg) ? Number(arg) : 0,
        claim: `CLM-2026-0${String(Date.now()).slice(-3)}`,
      });
    } catch (e) {
      current.fails.push(String(e).split("\n")[0]);
      end("fail");
    }
  }
} finally {
  await browser.close();
}
const out = path.join(SHOTS, `results-${Date.now()}.json`);
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(
  JSON.stringify(
    results.map((r) => ({ ...r, steps: undefined })),
    null,
    2,
  ),
);
console.log(`screens: ${SHOTS}`);
