/**
 * Environment variables, parsed and validated once at boot.
 * Spec §5.3 / Appendix A: the app refuses to start if a required variable is
 * missing or malformed. Only NEXT_PUBLIC_* values ever reach the browser.
 *
 * Business tunables (hold duration, SLA hours, deposit %, etc.) do NOT live here.
 * They live in the `settings` table and are editable from /admin/settings.
 */
import { z } from "zod";

const isProd = process.env.VERCEL_ENV === "production";

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
  HOSTAWAY_DIRECT_CHANNEL_ID: z.coerce.number().int().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),
  EMAIL_REPLY_TO: z.string().email(),

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

  // Hard guard from spec §5.1: writes to Hostaway only ever in production.
  if (parsed.data.HOSTAWAY_ALLOW_WRITES === "true" && !isProd) {
    throw new Error(
      "HOSTAWAY_ALLOW_WRITES=true is only permitted when VERCEL_ENV=production. " +
        "A write against a non-production Hostaway account propagates to every OTA channel.",
    );
  }

  cached = parsed.data;
  return cached;
}

/** True only when both guards agree that Hostaway writes are allowed. */
export function hostawayWritesEnabled(): boolean {
  const e = env();
  return e.HOSTAWAY_ALLOW_WRITES === "true" && e.VERCEL_ENV === "production";
}
