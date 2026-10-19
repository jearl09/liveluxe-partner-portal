/**
 * Used by scripts/demo-reset.mjs: load .env.local and refuse anything that is not the
 * TEST environment. Every check must pass before the script reads or writes a row.
 *
 *   - The Supabase project is the test project (an explicit allow-list, not "anything but production").
 *   - Stripe is in test mode (sk_test_ key; a live or restricted-live key stops the script).
 *   - Hostaway writes are off, and VERCEL_ENV / NODE_ENV are not production.
 *
 * One deliberate exception, for removing the test partner from the live site before real partners exist
 * (docs/golive/PREFLIGHT.md section 5): `--env-file <file> --project <ref>` reads another env file and allows that
 * one project, and only if the file really points at it. The Stripe test-mode and Hostaway writes-off checks still
 * apply, so this cannot run once the live site has live keys.
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

/** `--env-file <path> --project <ref>` from argv; both or neither, else an error string. */
export function parseTarget(argv) {
  const after = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
  };
  const envFile = after("--env-file");
  const project = after("--project");
  if (!envFile && !project) return { envFile: ".env.local", project: undefined };
  if (!envFile || !project) return { error: "--env-file and --project must be given together" };
  if (!/^[a-z]{20}$/.test(project)) return { error: `--project "${project}" is not a Supabase project ref` };
  return { envFile, project };
}

/** Why `e` may not be touched, as a list; empty means it is the test project (or the one explicitly named). */
export function envProblems(e, project) {
  const problems = [];
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(e.NEXT_PUBLIC_SUPABASE_URL ?? "")?.[1];
  if (project) {
    if (ref !== project) problems.push(`the env file points at project "${ref ?? "unknown"}", not --project ${project}`);
  } else if (!ref || !TEST_PROJECT_REFS.includes(ref))
    problems.push(`Supabase project "${ref ?? "unknown"}" is not a known TEST project`);
  if (!e.SUPABASE_SERVICE_ROLE_KEY) problems.push("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!(e.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"))
    problems.push("STRIPE_SECRET_KEY is not a test-mode key (sk_test_…)");
  if ((e.HOSTAWAY_ALLOW_WRITES ?? "").trim() === "true") problems.push("HOSTAWAY_ALLOW_WRITES is true");
  if (e.VERCEL_ENV === "production" || e.NODE_ENV === "production")
    problems.push("VERCEL_ENV or NODE_ENV is production");
  return { ref, problems };
}

export function loadTestEnv(argv = process.argv) {
  const target = parseTarget(argv);
  if (target.error) {
    console.error(`REFUSED: ${target.error}`);
    process.exit(2);
  }
  config({ path: target.envFile, quiet: true });
  const e = process.env;
  const { ref, problems } = envProblems(e, target.project);
  if (problems.length) {
    console.error("REFUSED: this is not the test environment.\n  - " + problems.join("\n  - "));
    process.exit(2);
  }
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stripe = new Stripe(e.STRIPE_SECRET_KEY);
  console.log(
    target.project
      ? `Named project ${ref} (from ${target.envFile}), Stripe test mode, Hostaway writes off.\n`
      : `Test environment confirmed: Supabase ${ref}, Stripe test mode, Hostaway writes off.\n`,
  );
  return { db, stripe, env: e, ref };
}

/** Throw on a Supabase error with the step's name, so a half-run reset says where it stopped. */
export function must(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}
