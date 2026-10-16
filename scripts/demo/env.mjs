/**
 * Used by scripts/demo-reset.mjs: load .env.local and refuse anything that is not the
 * TEST environment. Every check must pass before the script reads or writes a row.
 *
 *   - The Supabase project is the test project (an explicit allow-list, not "anything but production").
 *   - Stripe is in test mode (sk_test_ key; a live or restricted-live key stops the script).
 *   - Hostaway writes are off, and VERCEL_ENV / NODE_ENV are not production.
 *
 * Nothing here prints a secret.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import Stripe from "stripe";

/** The only Supabase projects these scripts may touch. Add a project here deliberately, never by default. */
const TEST_PROJECT_REFS = ["adgvnmbkvydkonnpskzx"];

/** Partner organisations that are demo or throwaway test data on the test environment, removed by demo-reset. */
export const DEMO_ORG_NAMES = ["Demo Insurance Co", "iinsurance de"];

export function loadTestEnv() {
  config({ path: ".env.local", quiet: true });
  const e = process.env;
  const problems = [];
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(e.NEXT_PUBLIC_SUPABASE_URL ?? "")?.[1];
  if (!ref || !TEST_PROJECT_REFS.includes(ref))
    problems.push(`Supabase project "${ref ?? "unknown"}" is not a known TEST project`);
  if (!e.SUPABASE_SERVICE_ROLE_KEY) problems.push("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!(e.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"))
    problems.push("STRIPE_SECRET_KEY is not a test-mode key (sk_test_…)");
  if ((e.HOSTAWAY_ALLOW_WRITES ?? "").trim() === "true") problems.push("HOSTAWAY_ALLOW_WRITES is true");
  if (e.VERCEL_ENV === "production" || e.NODE_ENV === "production")
    problems.push("VERCEL_ENV or NODE_ENV is production");
  if (problems.length) {
    console.error("REFUSED: this is not the test environment.\n  - " + problems.join("\n  - "));
    process.exit(2);
  }
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stripe = new Stripe(e.STRIPE_SECRET_KEY);
  console.log(`Test environment confirmed: Supabase ${ref}, Stripe test mode, Hostaway writes off.\n`);
  return { db, stripe, env: e, ref };
}

/** Throw on a Supabase error with the step's name, so a half-run reset says where it stopped. */
export function must(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}
