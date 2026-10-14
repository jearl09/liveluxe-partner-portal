/**
 * The LIVE verification project: the same scenario code as tests/integration,
 * but against real Stripe TEST MODE and the real Hostaway TEST ACCOUNT, using the
 * Supabase project named in .env.local through the service role.
 *
 *   npm run verify:live            # both suites
 *   npm run verify:live -- stripe  # one of them
 *
 * Refuses to run unless LIVE_VERIFY=1, STRIPE_SECRET_KEY starts with sk_test_,
 * HOSTAWAY_WRITE_TARGET=test and HOSTAWAY_TEST_ACCOUNT_ID matches (see tests/live/guard.ts).
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    setupFiles: ["tests/live/setup.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: ["verbose"],
  },
});
