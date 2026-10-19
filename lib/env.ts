/**
 * Environment variables, parsed and validated once at boot.
 * Spec §5.3 / Appendix A: the app refuses to start if a required variable is
 * missing or malformed. Only NEXT_PUBLIC_* values ever reach the browser.
 *
 * Business tunables (hold duration, SLA hours, deposit %, etc.) do NOT live here.
 * They live in the `settings` table and are editable from /admin/settings.
 */
import { z } from "zod";
import { approvalBlockedByConfig, stripeKeyPairMismatch } from "@/lib/domain/approval-guard";

/** Variables that are required in every environment. */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), // SECRET — used only in lib/db/admin.ts
  SUPABASE_DB_URL: z.string().optional(),

  // Hostaway (Public API v1, OAuth2 client credentials)
  HOSTAWAY_ACCOUNT_ID: z.string().min(1),
  HOSTAWAY_API_KEY: z.string().min(1), // SECRET
  HOSTAWAY_WEBHOOK_USER: z.string().min(16),
  HOSTAWAY_WEBHOOK_PASSWORD: z.string().min(32),
  HOSTAWAY_WEBHOOK_PATH_SECRET: z.string().min(32),
  HOSTAWAY_ALLOW_WRITES: z.enum(["true", "false"]).default("false"),
  /**
   * Which Hostaway account writes may reach (Phase 5 exit criterion: verified against the
   * TEST account). "production" = the §5.1 guard (HOSTAWAY_ALLOW_WRITES + VERCEL_ENV=production).
   * "test" = non-production only, and HOSTAWAY_ACCOUNT_ID must equal HOSTAWAY_TEST_ACCOUNT_ID,
   * so the switch can never be flipped on while the live account is configured.
   */
  HOSTAWAY_WRITE_TARGET: z.enum(["production", "test"]).default("production"),
  HOSTAWAY_TEST_ACCOUNT_ID: z.string().optional(),
  HOSTAWAY_DIRECT_CHANNEL_ID: z.coerce.number().int().optional(),

  // Stripe
  // sk_ = standard secret key; rk_ = restricted key (production uses one without payout/transfer rights).
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),
  EMAIL_REPLY_TO: z.string().email(),

  // Check-in pack encryption at rest (lib/security/access-crypto.ts). 32 bytes, hex or base64.
  // Optional: without it door codes and Wi-Fi passwords are not stored and the pack says to call.
  ACCESS_DETAILS_KEY: z.string().min(32).optional(),

  // Slack
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  SLACK_ALERTS_WEBHOOK_URL: z.string().url().optional(),

  // Maps
  NEXT_PUBLIC_MAP_TILE_KEY: z.string().optional(),
  NEXT_PUBLIC_MAP_STYLE_URL: z.string().url().optional(),

  // Jobs
  CRON_SECRET: z.string().min(32),

  // Observability
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof serverSchema>;

let cached: Env | undefined;

/**
 * Returns the validated environment. Throws a descriptive error listing every
 * missing/invalid variable the first time it is called.
 */
export function env(): Env {
  if (cached) return cached;

  // Blank values in .env files mean "unset" — let optional variables stay optional.
  const raw = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]));
  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const d = parsed.data;
  const isProd = d.VERCEL_ENV === "production";
  // Test and live Stripe keys never mix: the card form and the server would be in different Stripe worlds.
  const pair = stripeKeyPairMismatch(d.STRIPE_SECRET_KEY, d.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  if (pair) throw new Error(pair);
  // Hard guard from spec §5.1: writes to the live Hostaway account only ever in production.
  if (d.HOSTAWAY_ALLOW_WRITES === "true" && !isProd && d.HOSTAWAY_WRITE_TARGET !== "test") {
    throw new Error(
      "HOSTAWAY_ALLOW_WRITES=true is only permitted when VERCEL_ENV=production " +
        "(or with HOSTAWAY_WRITE_TARGET=test against the declared test account). " +
        "A write against the live Hostaway account propagates to every OTA channel.",
    );
  }
  if (d.HOSTAWAY_WRITE_TARGET === "test") {
    if (isProd) throw new Error("HOSTAWAY_WRITE_TARGET=test is not permitted when VERCEL_ENV=production.");
    if (!d.HOSTAWAY_TEST_ACCOUNT_ID)
      throw new Error("HOSTAWAY_WRITE_TARGET=test requires HOSTAWAY_TEST_ACCOUNT_ID (the test account's Account ID).");
    if (d.HOSTAWAY_TEST_ACCOUNT_ID !== d.HOSTAWAY_ACCOUNT_ID)
      throw new Error(
        "HOSTAWAY_WRITE_TARGET=test but HOSTAWAY_ACCOUNT_ID is not the declared test account. " +
          "Refusing to start: this would write to a Hostaway account that is not the test account.",
      );
  }

  cached = d;
  return cached;
}

/** Where a Hostaway write would land, or null when writes are off. */
export function hostawayWriteTarget(): "production" | "test" | null {
  const e = env();
  if (e.HOSTAWAY_ALLOW_WRITES !== "true") return null;
  if (e.HOSTAWAY_WRITE_TARGET === "test")
    return e.VERCEL_ENV !== "production" && e.HOSTAWAY_TEST_ACCOUNT_ID === e.HOSTAWAY_ACCOUNT_ID ? "test" : null;
  return e.VERCEL_ENV === "production" ? "production" : null;
}

/** True only when the guards agree that Hostaway writes are allowed (live in production, or the declared test account). */
export function hostawayWritesEnabled(): boolean {
  return hostawayWriteTarget() !== null;
}

/**
 * Why approval, confirmation and extension must be refused in this configuration (live Stripe
 * with Hostaway writes off: money would move with no reservation), or null when it is safe.
 */
export function approvalConfigBlock(): string | null {
  const e = env();
  return approvalBlockedByConfig({ stripeSecretKey: e.STRIPE_SECRET_KEY, hostawayWritesEnabled: hostawayWritesEnabled() });
}

/** Test-only: forget the cached environment so a test can change process.env. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}
