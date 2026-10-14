import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const HOSTAWAY_SELECTORS = [
  {
    selector: "Literal[value=/api\.hostaway\.com/]",
    message: "Direct calls to api.hostaway.com are forbidden; use hostawayFetch() (spec §6.2).",
  },
  {
    selector: "TemplateElement[value.raw=/api\.hostaway\.com/]",
    message: "Direct calls to api.hostaway.com are forbidden; use hostawayFetch() (spec §6.2).",
  },
];

const PALETTE =
  "(bg|text|border|ring|outline|from|to|via|fill|stroke|accent|decoration|divide|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9][0-9][0-9]?";

const COLOUR_SELECTORS = [
  {
    selector: "Literal[value=/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/]",
    message: "Raw hex colour. Use a role token (bg-surface, text-muted, status-attention-fg…) from DESIGN.md.",
  },
  {
    selector: "TemplateElement[value.raw=/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/]",
    message: "Raw hex colour. Use a role token from DESIGN.md.",
  },
  {
    selector: `Literal[value=/${PALETTE}/]`,
    message: "Tailwind palette colour. Use a role token (status-*-bg/fg/border, inset, surface…) from DESIGN.md.",
  },
  {
    selector: `TemplateElement[value.raw=/${PALETTE}/]`,
    message: "Tailwind palette colour. Use a role token from DESIGN.md.",
  },
  {
    selector: "Literal[value=/-[[](#|rgb|hsl|oklch)/]",
    message: "Arbitrary colour value. Use a role token from DESIGN.md.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    ".claude/**",
    ".impeccable/**",
  ]),

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
    rules: { "no-restricted-syntax": ["error", ...HOSTAWAY_SELECTORS] },
  },

  // Brief §4 — no raw colours in the UI: every colour is a role token from app/globals.css.
  // ESLint replaces a rule's options per matching block rather than merging them, so this
  // block repeats the Hostaway selectors; keep it after the block above.
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...HOSTAWAY_SELECTORS, ...COLOUR_SELECTORS] },
  },
]);

export default eslintConfig;
