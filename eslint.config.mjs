import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**", "playwright-report/**"]),

  // Spec §8.3 — the service-role client must never be importable from partner-facing or client code.
  {
    files: ["app/(portal)/**", "app/(marketing)/**", "components/**", "lib/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db/admin",
              message: "Service-role client is forbidden here (spec §8.3). Use @/lib/db/server.",
            },
            {
              name: "@/lib/stripe/client",
              message: "Stripe secret client is server-only; call it from a Route Handler.",
            },
            {
              name: "@/lib/hostaway/client",
              message: "Hostaway client is server-only; call it from a Route Handler or job.",
            },
          ],
          patterns: [{ group: ["**/lib/db/admin"], message: "Service-role client is forbidden here (spec §8.3)." }],
        },
      ],
    },
  },

  // Spec §3.2 — domain services stay framework-free so they are unit-testable.
  {
    files: ["lib/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next/*", "@supabase/*", "stripe", "@/lib/db/*", "@/lib/hostaway/*", "@/lib/stripe/*"],
              message: "lib/domain must be pure (spec §3.2).",
            },
          ],
        },
      ],
    },
  },

  // Spec §6.2 — every Hostaway call goes through lib/hostaway/client.ts.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/hostaway/client.ts", "lib/hostaway/token.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/api\\.hostaway\\.com/]",
          message: "Direct calls to api.hostaway.com are forbidden; use hostawayFetch() (spec §6.2).",
        },
        {
          selector: "TemplateElement[value.raw=/api\\.hostaway\\.com/]",
          message: "Direct calls to api.hostaway.com are forbidden; use hostawayFetch() (spec §6.2).",
        },
      ],
    },
  },
]);

export default eslintConfig;
