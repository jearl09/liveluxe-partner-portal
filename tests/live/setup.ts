/**
 * Live-verification guard. Every value comes from .env.local; nothing here is a
 * placeholder, because this project talks to real (test-mode) services.
 */
const must = (k: string) => {
  if (!process.env[k]) throw new Error(`verify:live needs ${k} in .env.local`);
  return process.env[k]!;
};

if (process.env.LIVE_VERIFY !== "1")
  throw new Error(
    "verify:live is opt-in: set LIVE_VERIFY=1 (it writes to the Supabase project, Stripe test mode and the Hostaway test account named in .env.local)",
  );

(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.VERCEL_ENV ??= "development";
if (process.env.VERCEL_ENV === "production") throw new Error("verify:live must never run with VERCEL_ENV=production");

for (const k of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "HOSTAWAY_ACCOUNT_ID",
  "HOSTAWAY_API_KEY",
  "STRIPE_SECRET_KEY",
])
  must(k);
if (!process.env.STRIPE_SECRET_KEY!.startsWith("sk_test_"))
  throw new Error("verify:live refuses a non-test Stripe key (STRIPE_SECRET_KEY must start with sk_test_)");
if (process.env.HOSTAWAY_WRITE_TARGET !== "test") throw new Error("verify:live needs HOSTAWAY_WRITE_TARGET=test");
if (process.env.HOSTAWAY_TEST_ACCOUNT_ID !== process.env.HOSTAWAY_ACCOUNT_ID)
  throw new Error(
    "verify:live needs HOSTAWAY_TEST_ACCOUNT_ID to equal HOSTAWAY_ACCOUNT_ID (the Hostaway TEST account)",
  );
process.env.HOSTAWAY_ALLOW_WRITES = "true";

// Required by lib/env.ts but not used by the live suites; harmless defaults.
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "live-verify";
process.env.HOSTAWAY_WEBHOOK_USER ??= "live-verify-webhook-user";
process.env.HOSTAWAY_WEBHOOK_PASSWORD ??= "live-verify-webhook-password-0123456789";
process.env.HOSTAWAY_WEBHOOK_PATH_SECRET ??= "live-verify-webhook-path-secret-0123456789";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_live_verify";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_live_verify";
process.env.RESEND_API_KEY ??= "re_live_verify";
process.env.EMAIL_FROM ??= "bookings@test.livluxe.com.au";
process.env.EMAIL_REPLY_TO ??= "ops@test.livluxe.com.au";
process.env.CRON_SECRET ??= "live-verify-cron-secret-0123456789abcdef";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
