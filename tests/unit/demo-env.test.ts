import { describe, expect, it } from "vitest";
import { envProblems, parseTarget } from "../../scripts/demo/env.mjs";

const TEST = "adgvnmbkvydkonnpskzx";
const LIVE = "hypimlrdlfcwsmqcodtq";
const base = (ref: string) => ({
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "x",
  STRIPE_SECRET_KEY: "sk_test_x",
  HOSTAWAY_ALLOW_WRITES: "false",
});

describe("demo-reset target (scripts/demo/env.mjs)", () => {
  it("defaults to .env.local and the test allow-list", () => {
    expect(parseTarget(["node", "s"])).toEqual({ envFile: ".env.local", project: undefined });
    expect(envProblems(base(TEST), undefined).problems).toEqual([]);
    expect(envProblems(base(LIVE), undefined).problems[0]).toMatch(/not a known TEST project/);
  });
  it("needs --env-file and --project together, and a real-looking ref", () => {
    expect(parseTarget(["node", "s", "--project", LIVE]).error).toMatch(/together/);
    expect(parseTarget(["node", "s", "--env-file", ".env.live", "--yes"]).error).toMatch(/together/);
    expect(parseTarget(["node", "s", "--env-file", ".env.live", "--project", "nope"]).error).toMatch(/not a Supabase/);
    expect(parseTarget(["node", "s", "--env-file", ".env.live", "--project", LIVE, "--yes"])).toEqual({
      envFile: ".env.live",
      project: LIVE,
    });
  });
  it("allows the named project only when the file points at it", () => {
    expect(envProblems(base(LIVE), LIVE).problems).toEqual([]);
    expect(envProblems(base(TEST), LIVE).problems[0]).toMatch(/not --project/);
  });
  it("still refuses a live Stripe key or Hostaway writes on the named project", () => {
    expect(envProblems({ ...base(LIVE), STRIPE_SECRET_KEY: "rk_live_x" }, LIVE).problems[0]).toMatch(/test-mode/);
    expect(envProblems({ ...base(LIVE), HOSTAWAY_ALLOW_WRITES: "true" }, LIVE).problems[0]).toMatch(/writes/i);
  });
});
