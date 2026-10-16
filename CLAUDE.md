@AGENTS.md

# Livluxe Partner Portal — working notes for AI assistants

- The architecture of record is `docs/spec/Livluxe-Partner-Booking-Platform-Architecture-Spec.pdf`. Code comments cite it as "§N".
- Read `README.md` for layout, `docs/GETTING-STARTED.md` for setup, `docs/DECISIONS-REQUIRED.md` for open business decisions.
- **Start with `docs/HANDOFF.md`** — current state, what is blocked, and next steps.
- `lib/domain/**` is pure: no Next.js, Supabase, Stripe or Hostaway imports. Unit-test it to ≥ 90%.
- `lib/db/admin.ts` (service role) is forbidden in `app/(portal)`, `app/(marketing)`, `components`, `lib/domain`. ESLint and `npm run guard:service-role` enforce this.
- Every Hostaway call goes through `hostawayFetch()`; never `fetch("https://api.hostaway.com…")` elsewhere.
- Money is integer cents. Dates are calendar dates in the property's timezone. Timestamps are UTC with explicit labels in the UI.
- Writes to Hostaway are refused unless `HOSTAWAY_ALLOW_WRITES=true` _and_ `VERCEL_ENV=production`.
- Do not hard-code business tunables (SLA, hold hours, deposit %, tax). They live in the `settings` table.
- Next.js 16: use `proxy.ts` (not middleware), `await params` / `await searchParams`, two-argument `revalidateTag(tag, "max")`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
