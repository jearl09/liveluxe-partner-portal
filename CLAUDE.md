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
