# Livluxe Partner Direct Booking Platform

Invite-only booking portal for Live Luxe Pty Ltd (ABN 16 678 772 613) insurance and corporate partners.
Inventory, availability, rates and check-in data sync from **Hostaway**; payments and invoicing run through **Stripe**;
identity, data and audit trail live on **Supabase** (Postgres + RLS); deployed on **Vercel** (Sydney).

The architecture of record is `docs/spec/Livluxe-Partner-Booking-Platform-Architecture-Spec.pdf` (v1.0, 16 Sep 2026).
Section numbers in code comments (e.g. "§6.2") refer to that document.

## Stack

| Layer     | Choice                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, React Server Components, Route Handlers on Node runtime), TypeScript strict       |
| UI        | Tailwind CSS v4, shadcn/ui-style components on Radix primitives, lucide-react                             |
| Forms     | react-hook-form + Zod (same schemas on client and server)                                                 |
| Data      | Supabase Postgres 15 + PostGIS, row-level security, generated types                                       |
| Auth      | Supabase Auth, invite-only, JWT custom claims (`org_id`, `role`), optional TOTP MFA (Settings → Security) |
| Payments  | Stripe PaymentIntents (manual capture), Invoicing, Customers, BECS                                        |
| PMS       | Hostaway Public API v1 via a hand-rolled governed client (`lib/hostaway`)                                 |
| Maps      | MapLibre GL + MapTiler/Mapbox tiles, supercluster, native heatmap layer                                   |
| Email     | Resend + React Email                                                                                      |
| Jobs      | Vercel Cron → `/api/cron/{job}` with Postgres advisory locks                                              |
| Tests     | Vitest (unit/integration), Playwright (E2E), MSW + Stripe CLI                                             |
| CI/CD     | GitHub Actions → Vercel previews; Supabase CLI migrations                                                 |

## Repository layout

```
app/
  (marketing)/      login · invite/[token] · reset-password{,/confirm} · mfa/{enrol,verify}   (public chrome)
  (portal)/         / · search · listings/[id] · requests · basket · invoices · team · settings   (partner)
  (admin)/admin/    queue · bookings · calendar · partners · rate-cards · listings · reports · integrations · audit · settings
  api/
    auth/             sign-in · sign-out · callback · reset-password{,/confirm} · accept-invite · mfa/verify
    invitations       issue an invitation (org.manage_users)
    quotes · requests · payments · invoices · team · map · listings   (partner API)
    admin/            queue · requests/[id]/{approve,decline,counter,release-checkin} · refunds · partners · rate-cards · listings · integrations
    cron/[job]        one authenticated entry point for every scheduled job (see lib/jobs/registry.ts)
    webhooks/stripe   signature-verified, persisted, processed async
    webhooks/hostaway/[secret]   basic-auth + path secret, payload treated as a hint
    health
lib/
  domain/           PURE logic: errors, money, state machine, permissions, availability, quote engine, auth policy
  auth/             server helpers: rate limiting (Postgres window), invite tokens, HIBP check, MFA status
  hostaway/         client (governor/retry/breaker), token store, rate limiter, mappers, typed api, zod types
  stripe/           client helpers, webhook handler catalogue
  db/               server.ts (RLS client) · admin.ts (service role — restricted) · types.ts (generated)
  notifications/    email (Resend), slack, templates/
  jobs/             registry (schedules), run (lock + sync_runs), lock
  observability/    structured logger with redaction
  api/              response envelope, withApi() wrapper, Zod body parsing
  env.ts            Zod-validated environment; refuses to boot if misconfigured
components/         ui/ (shadcn-style) · layout/
supabase/
  migrations/       forward-only SQL (schema, RLS, functions, seed of permissions + settings)
  seed/             local dev fixtures
tests/              unit · integration · e2e · fixtures/{hostaway,stripe}
docs/               spec PDFs · ADRs · runbooks · GETTING-STARTED · DECISIONS-REQUIRED
proxy.ts            session refresh + auth redirects + X-Request-Id (Next 16 "proxy", formerly middleware)
vercel.json         cron schedules, Sydney region, security headers
```

## Getting started

See **docs/GETTING-STARTED.md** for the full walkthrough. Short version:

```bash
nvm use                     # Node 24
npm install
cp .env.example .env.local  # fill in Supabase local keys after `npm run db:start`
npm run db:start            # local Supabase stack (needs Docker Desktop)
npm run db:reset            # applies migrations + seed
npm run db:types            # regenerate lib/db/types.ts
npm run dev                 # http://localhost:3000
```

Other useful commands:

```bash
npm run typecheck           # next typegen + tsc
npm run lint                # eslint incl. service-role / hostaway import guards
npm run test:unit           # vitest, ≥ 90% coverage on lib/domain enforced
npm run test:e2e            # playwright (starts dev server, or BASE_URL=https://preview…)
npm run stripe:listen       # forward Stripe test webhooks locally
npm run guard:service-role  # CI check that admin client never leaks into partner/client code
```

## Non-negotiables (from the spec)

- **Hostaway is the source of truth for inventory.** The platform holds a cache; availability is re-verified live at approval.
- **Money is never inferred.** Stripe webhooks are the only trusted payment signal; never confirm from a client redirect.
- **Every state change is an event** with actor, type, reason and timestamp, written in the same transaction.
- **Fail closed on availability.** A missing day is unavailable.
- **Tenancy is enforced in Postgres (RLS)**, not the application. The service-role client lives in one module and is lint-restricted.
- **Idempotency everywhere external.** Every webhook and every outbound write carries a key and is safe to replay.
- **Writes to Hostaway only in production** (`HOSTAWAY_ALLOW_WRITES=true` + `VERCEL_ENV=production`), never from staging.

## Delivery phases (spec §22)

| #   | Phase                                      | Effort   | Exit criterion                                                      |
| --- | ------------------------------------------ | -------- | ------------------------------------------------------------------- |
| 0   | Foundations (this scaffold → working auth) | 1 wk     | Invite → accept → log in → empty dashboard in all envs              |
| 1   | Hostaway read integration                  | 2–2.5 wk | Full catalogue + 400-day calendar stays in step for 72 h unattended |
| 2   | Search, listings, map, heat map            | 2–2.5 wk | Partner finds a property for real dates with an accurate total      |
| 3   | Quoting and requests                       | 2 wk     | Request flows to ops queue with correct price and working hold      |
| 4   | Stripe and invoicing                       | 2 wk     | Every §17.2 scenario passes in test mode                            |
| 5   | Approval workflow + Hostaway write-back    | 2 wk     | Happy path + every §17.3 failure mode verified on test account      |
| 6   | Admin, reporting, hardening                | 1.5–2 wk | Security + accessibility suites green, load targets met             |
| 7   | Pilot and launch                           | 2 wk     | Pilot partner transacting exclusively through the portal            |

**Before Phase 1 can start:** a Hostaway _test_ account with API access (decision #10 in `docs/DECISIONS-REQUIRED.md`).
