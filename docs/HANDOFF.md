# Handoff — state of the project as of 2026-10-09 (session 4)

Read this first when starting a new Claude Code session in this folder.

## What this is

Livluxe Partner Direct Booking Platform for Live Luxe Pty Ltd (ABN 16 678 772 613). Invite-only portal for insurance
and corporate partners to book long stays. Built from `docs/spec/Livluxe-Partner-Booking-Platform-Architecture-Spec.pdf`
(v1.0, 16 Sep 2026), which is the architecture of record. Code comments cite it as §N.

## Stack (per spec)

Next.js 16 (App Router, `proxy.ts`), TypeScript strict, Tailwind v4, shadcn-style components, Supabase (Postgres + PostGIS + RLS),
Stripe, Hostaway Public API v1 (hand-rolled client), Resend, MapLibre, Vercel Cron, Vitest, Playwright, GitHub Actions. npm.

## Done

### Session 1 — Phase 0 foundations

- Full repo scaffold per spec §5.2. `README.md` has the layout; `docs/GETTING-STARTED.md` the setup.
- Pure domain layer (`lib/domain`): state machine, quote engine, availability, permissions, money, errors.
- Integration clients: Hostaway (governor, token, retry, breaker), Stripe, Resend, Slack. Webhook receivers. 14 cron jobs registered (stubs).
- Initial migration applied to the HOSTED Supabase project (ap-southeast-2) via the SQL editor. Three follow-up patches in
  `supabase/patches/` were also applied; the migration file already includes them.
- Admin user exists: claudia@liveluxeau.com, role livluxe_admin, org 00000000-0000-0000-0000-000000000001.
- `.env.local` has real Supabase keys plus generated local-dev values for CRON_SECRET and Hostaway webhook secrets.
  Hostaway account/API key and Resend key are placeholders.

### Session 2 — Phase 0 auth hardening (spec §8.1 / §8.2) — code complete, NOT yet exercised end-to-end

- **Login rate limiting**: 5 / account / 15 min and 20 / IP / 15 min, sliding window in Postgres
  (`auth_attempts` + `auth_rate_limit_hit()`), applied to sign-in, MFA verify, reset request and invite acceptance.
  Fails OPEN (with an error log) if the function is missing — apply the migration to turn it on.
- **Invitation flow**: `POST /api/invitations` (needs `org.manage_users`; partner_admin → partner roles in own org,
  livluxe_admin → anyone) inserts via RLS, stores SHA-256(token), emails `templates/invitation.tsx` with a 7-day link.
  `/invite/[token]` previews through the anonymous `invitation_preview()` function; `POST /api/auth/accept-invite`
  creates the auth user (service role), runs `accept_invitation()` atomically, audits, signs in. Orphan auth users are
  deleted if acceptance fails.
- **Password reset**: `/reset-password` → Supabase recovery email → `/api/auth/callback` (PKCE `code` or
  `token_hash` link styles) → `/reset-password/confirm` → `POST /api/auth/reset-password/confirm` → sign out → login.
- **Password policy + HIBP**: ≥12 chars, not containing the email local-part, k-anonymity breach check on every
  password set (fails open, logged). Pure rules in `lib/domain/auth.ts`.
- _\*TOTP MFA for livluxe_* roles_*: `/mfa/enrol` (QR + manual key), `/mfa/verify`, `POST /api/auth/mfa/verify`
  (`challengeAndVerify`). Enforced three times: `proxy.ts` (JWT `aal` claim), `app/(admin)/layout.tsx`
  (`getAuthenticatorAssuranceLevel`), and the post-login redirect. First verification sets `partner_users.mfa_enrolled`
  and writes `auth.mfa_enrolled` to `audit_log`.
- `proxy.ts` now returns the §16.1 JSON 401 envelope for unauthenticated `/api/*` calls instead of redirecting.
- Tests: 49 unit tests, `lib/domain` coverage 95%. typecheck · lint · build · guard all green.
- New migration: `supabase/migrations/20261006120000_phase0_auth.sql`.

## Departures from the spec (all deliberate)

- JWT custom claim is `user_role`, not `role` (Supabase reserves `role` for the Postgres role). Helpers: `public.jwt_org_id()`,
  `public.jwt_role()`, `public.jwt_is_livluxe()` — in `public`, not `auth` (hosted Supabase forbids writing to `auth`).
- JWT hook `public.custom_access_token_hook` is `security definer`.
- `proxy.ts` (Next 16) instead of `middleware.ts`.
- Invitation acceptance uses the service role (to create the auth user) from `app/api/auth/accept-invite` — an
  explicitly audited admin operation per §8.3. Everything else in the flow goes through RLS or security-definer functions.

## BLOCKED — dashboard actions only you can do (in this order)

1. **Apply the Phase 0 auth migration**: paste `supabase/migrations/20261006120000_phase0_auth.sql` into the SQL editor.
   Until then login works but is NOT rate limited (logged as auth.rate_limit_unavailable).
2. **Enable the JWT claims hook** (still outstanding from session 1): Authentication → Hooks → Customize Access Token (JWT)
   Claims → Postgres → schema `public` → function `custom_access_token_hook` → Save. Verify by signing in: `/login` should
   no longer bounce back with `?setup=hook`.
3. **Enable TOTP** (only if anyone wants to turn MFA on): Authentication → Multi-Factor → TOTP → Enabled.
4. **URL configuration**: Site URL = app origin; add `<origin>/api/auth/callback` (and the Vercel preview pattern) to the
   redirect allow-list. Optionally change the "Reset password" email template as described in `docs/GETTING-STARTED.md`.
5. **Resend**: a real `RESEND_API_KEY` and verified sending domain before issuing invitations (the insert succeeds
   and is audited before the email is sent; a send failure surfaces as HTTP 500 from `POST /api/invitations`).

Run `node scripts/check-auth-setup.mjs claudia@liveluxeau.com` — it tells you which of steps 1–2 is still outstanding.
Then sign in → `/admin/queue`; optionally Settings → Security → Turn on MFA.
Then issue an invitation with `curl -X POST /api/invitations -H 'content-type: application/json'
-d '{"email":"…","role":"partner_admin","orgId":"<partner org uuid>"}'` (cookie from the browser session) and accept it.

### Session 2 (cont.) — brand theme

- Root cause of the "faded" UI: shadcn tokens (`bg-primary`, `border-input`…) were never defined, and `globals.css`
  flipped to a dark background under an OS dark-mode preference. Both fixed.
- Live Luxe theme from the public Docklands site: navy `#101c2c`, cream `#f4efe6`, gold `#b7853a`, Playfair Display
  headings, Inter body. Tokens in `app/globals.css`; `.eyebrow` and `.gold-rule` utilities.
- New: `components/layout/brand.tsx` (wordmark), `nav-links.tsx` (active state), restyled `app-shell.tsx` (cream partner
  header, navy ops header, sign-out, footer), split-screen auth layout, `PageHeader`, `StatCard`, dashboard, search and
  queue placeholders. Button gained a `gold` variant.
- `scripts/check-auth-setup.mjs <email>` diagnoses login (migration applied? partner_users active? JWT hook on?).

### Session 2 (cont.) — partner dashboard (§13.1 "/")

- Built to the brief in chat: header with greeting + freshness pill, "Needs your attention" strip (renders only when
  non-empty), 4 KPI tiles linking to pre-filtered /requests, requests-in-progress table (action-first sort, card list
  under 1280 px, prints cleanly), 7-day agenda with access-pack notes, recent activity (tz-labelled, UTC on hover),
  quick search, manual-search fallback band, sticky phone search button, skeleton `loading.tsx`, per-section error
  cards with support refs.
- Pure view-model in `lib/domain/dashboard.ts` (tested); loader in `lib/dashboard/load.ts` on the RLS client.
  Real data arrives with Phase 3; until then `/?demo=1` (non-production) and `/dev/dashboard[?state=empty|stale]`
  (no session needed, 404 in production) show sample data for design review.
- New migration `supabase/migrations/20261006130000_dashboard.sql`: `partner_orgs.logo_url` (co-branded header),
  `availability_freshness()` (partner-safe read of the last sync), setting `sync.stale_after_minutes`.
  Apply it in the SQL editor with the Phase 0 auth one.
- Shared `StatusPill` (`components/ui/status-pill.tsx`) is THE status colour mapping; reuse it on /requests and /admin.

### Session 3 (2026-10-08) — Week 1 of the 3-week plan: Hostaway sync, search, listing detail

- **Environment**: Supabase (engineer's project `adgvnmbkvydkonnpskzx`) has all three migrations, the JWT hook and TOTP;
  `check-auth-setup.mjs` is all green. Real Hostaway key (partner label `claude`, named "Livluxe Partner Portal") and
  Stripe test keys are in `.env.local` on the laptop and the Mac mini; David's sweeper moves them into Proton Pass.
  The Mac mini runs `pp npm run dev` on http://100.97.204.91:3000 (Tailscale only).
- **Sync jobs are real** (`lib/jobs/sync-listings.ts`, `lib/jobs/sync-calendar.ts`), wired in the registry:
  - `sync-listings`: pages `/listings`, maps through `mapListing`, hash-compare upsert, replaces images + amenities,
    touches unchanged rows, soft-deletes absent ones only on a complete fetch. `geom` / `geom_public` written as EWKT;
    the public pin is a deterministic 100–200 m jitter (`lib/domain/geo.ts`).
  - `sync-calendar-near` (today → +120 d) and `-far` (+121 → +400 d): walk active listings in id order in batches of 60
    within a 200 s budget; the cursor is stored in `sync_runs.checkpoint` and the next run resumes. Per-listing failures
    are logged and skipped; a run fails only if nothing succeeded.
  - Trigger locally: `node scripts/run-job.mjs sync-listings` (then `sync-calendar-near`, `sync-calendar-far`) against a
    running dev server. Read-only against Hostaway; writes stay blocked by `HOSTAWAY_ALLOW_WRITES`.
  - Sensitive fields (door codes, Wi-Fi) are mapped but **not persisted yet** (needs the encrypted
    `listing_access_details` writer). They are never logged.
- **/search is live**: `parseSearchParams` (pure, tested) → `searchListings` (RLS). With dates it calls
  `search_available_listings()` (gap-free, holds and approved bookings excluded) and shows avg nightly + stay total
  from `calendar_days`; without dates it lists the catalogue. Suburb/postcode/name filter, guests, pets, bedrooms,
  24 per page, freshness pill, inline error card with support ref. Map column removed until a tile key exists.
- **/listings/[id] is live**: gallery, facts, sanitised description, 90-day availability strip, stay details, fees,
  amenities, house rules, and a server-rendered quote panel. Street address hidden (suburb/state/postcode only).
- **Pricing**: `lib/listings/price.ts` (`priceStay`) is the single pricing path for the page and `POST /api/quotes`
  (now reads real calendar rows). Rate card = null and tax = placeholder GST until week 2; the UI says "indicative".
- `lib/db/types.ts` extended by hand: full `listings` row (as a `type`, not `interface` — an interface breaks the
  supabase-js schema generic and turns every query into `never`), `listing_images`, `listing_amenities`,
  `calendar_days`, `search_available_listings`.
- Tests: 90 unit tests; new `geo`, `dates`, `sync`, `search`, `hostaway-mappers`. Domain coverage 93 % lines.

### Session 3 (cont.) — first real sync, and what it taught us

- First live sync against the Live Luxe Hostaway account succeeded: 129 listings, 2,336 images, 6,159 amenity rows,
  ~50,000 calendar days (near + far). Hostaway lists check-in windows past midnight (hour 26 = 2 am); the mapper now
  wraps hours into 0–23 instead of failing the whole upsert.
- Hostaway holds operational pseudo-listings ("CLEANING - …", "[DISCARDED] …"). `looksInternalListing()` hides them
  from partners at sync time (`is_partner_visible = false`, never raised back). 14 of 129 are hidden. Ops will need
  `/admin/listings` to curate the rest (some real apartments carry a $10 base price or no bedroom count).
- **Bug found and fixed**: `pg_try_advisory_lock` is session-scoped; behind Supabase's REST connection pool the unlock
  runs on another session and the lock leaks (a job was "skipped: lock held" a second after the previous run ended).
  Replaced by a lease row: migration `20261008100000_job_leases.sql` (`job_leases`, `job_lease_acquire/release`,
  drops the advisory helpers). `withAdvisoryLock()` keeps its name and signature; TTL defaults to 6 min.
  **Apply this migration in the SQL editor before running any job again** — `lib/jobs/lock.ts` calls the new RPCs.
- `SUPABASE_DB_URL` in `.env.local` points at a local stack (127.0.0.1:54322), so migrations still go through the
  dashboard SQL editor on the hosted project.

### Session 3 (cont.) — test deployment on Vercel (2026-10-08 evening)

- **Live test link: https://liveluxe-partner-portal.vercel.app** on the engineer's personal Vercel account (Hobby),
  project `liveluxe-partner-portal`, same Supabase project as local dev, so synced data and users are shared.
- Env pushed with `node scripts/vercel-env-push.mjs` (reads `.env.local`, never prints values; skips blanks and
  `NEXT_PUBLIC_APP_URL`, which is set to the Vercel URL). Re-run it after any `.env.local` change, then redeploy.
- Hobby allows two daily crons, so deploys go through `node scripts/deploy-hobby.mjs` (swaps `vercel.json` to nightly
  `sync-listings` + `sync-calendar-near`, restores afterwards). Other jobs: trigger by hand with
  `NEXT_PUBLIC_APP_URL=https://liveluxe-partner-portal.vercel.app node scripts/run-job.mjs <job>`.
- `.vercel/` is git-ignored; `vercel link` also appended `VERCEL_OIDC_TOKEN` to `.env.local` (harmless, skipped by the push).
- Still to do for this link: Supabase → Authentication → URL Configuration: Site URL
  `https://liveluxe-partner-portal.vercel.app`, add `https://liveluxe-partner-portal.vercel.app/api/auth/callback` to the
  redirect allow-list (needed only for password-reset emails). Go-live moves to the General group's Pro team with
  the full cron schedule.

### Session 4 (2026-10-09) — Week 2 core: requests, holds, queue, decisions

- **Migration `20261009100000_booking_requests.sql`** (applied to the dev project): `submit_booking_request()`,
  `apply_booking_transition()` (both security definer, atomic: row + hold + history + notification + audit), and
  `request_policy()` (partner-safe read of SLA / hold / quote tunables). Error contract: `raise exception 'CODE[:detail]'`
  mapped back to `DomainError` by `lib/requests/errors.ts`.
- **Flow verified end to end in a browser** (Playwright, dev server, real synced listing): partner search → listing →
  quote → `/requests/new` → submit (hold placed, `LLX-2026-000001`) → ops queue → counter-offer → partner accepts →
  ops approves with a live Hostaway calendar re-check → partner sees Approved. Expire-holds job runs clean.
- Partner pages: `/requests` (Open / Upcoming / History), `/requests/[id]` (status, stay, quote, timeline, counter-offer
  accept/decline), `/requests/new`. Ops: `/admin/queue` (SLA bands), `/admin/bookings` (+status filter),
  `/admin/bookings/[id]` (approve / counter / decline). Shared components in `components/requests`.
- Domain additions: `lib/domain/requests.ts` (form validation, business-hours SLA via date-fns-tz, SLA bands, counter
  validation, `applyOpsAdjustment` with a new `adjustment` line kind), state machine gained COUNTER_OFFERED → EXPIRED (system).
- Design decisions: no DRAFT state in the UI (submit creates SUBMITTED directly); approve/decline/counter from SUBMITTED
  auto-pass through UNDER_REVIEW; counter-offer = new `quotes` row (supersedes) + extended hold; partners cannot
  withdraw a SUBMITTED request yet (no such transition in §10.1); emails are attempted after submit and skipped with a
  warning while `RESEND_API_KEY` is a placeholder.
- Test accounts on the dev project (passwords were given to the engineer in chat, never stored here):
  `demo.partner@liveluxeau.com` (partner_admin, org "Demo Insurance Co", requires claim ref) and
  `ops.test@liveluxeau.com` (livluxe_ops). Manager: `angel@liveluxeau.com` (livluxe_admin).
- Admin nav trimmed to screens that exist (Queue, Bookings, Settings).

## Known gaps / follow-ups in this area

- Spec §8.2 items not yet built: idle/absolute session timeouts (partner 12 h / 30 d, Livluxe 2 h / 7 d), email notice on
  account lock, exponential delay on invite-token attempts, new-device email, invitee email-domain allowlist (§8.1),
  impersonation (§8.2). Password reset does not yet revoke other sessions.

- No UI yet for issuing invitations (`/team`, `/admin/partners` are Phase 2+); the API is ready.
- No MFA recovery codes. Lost device = delete the factor in the Supabase dashboard (Authentication → Users → MFA).
- `lib/db/types.ts` is still hand-maintained. Run `npm run db:types` against a local stack once Docker is available.
- The `/invite/[token]` page and `accept-invite` route each look the token up once; acceptance re-checks atomically in SQL.
- E2E (Playwright) coverage of these flows is not written; they need a local Supabase stack with Inbucket for the emails.
- Week 1 gaps: no map (needs `NEXT_PUBLIC_MAP_TILE_KEY`); `search_available_listings` runs with invoker rights, so another
  org's APPROVED bookings only block dates once Hostaway reflects them (fine once holds/writes land in week 2);
  `listing_amenities.amenity_code` is the Hostaway amenity id as text; quotes are not persisted; `settings` has no
  partner-safe read yet (placeholder tax rules in code); access details not stored; Hostaway fixture is still a placeholder
  — record a real `/listings/{id}` response and replace `tests/fixtures/hostaway/listing.json`.

## Move to the client's Supabase project (do before the first partner is invited)

Development runs on the engineer's own Supabase project. Switch to Live Luxe's project by the end of week 2 of the
3-week plan, while the only data is the admin user and demo rows. Steps, under an hour:

1. Client project in ap-southeast-2 (Sydney), Pro plan (PITR + daily backups per spec §18.2).
2. SQL editor: run the migrations in order: `20261006000000_initial_schema.sql`, `20261006120000_phase0_auth.sql`,
   `20261006130000_dashboard.sql`. Then `supabase/seed/seed.sql` if demo data is wanted.
3. Dashboard: enable the JWT hook (`public.custom_access_token_hook`), enable TOTP, set Site URL and add
   `/api/auth/callback` to the redirect allow-list, optionally the reset-password email template (GETTING-STARTED.md).
4. Create the first livluxe_admin auth user and its active `partner_users` row (GETTING-STARTED.md).
5. Swap `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Proton Pass
   (`Builds/liveluxe-partner-portal`) and in Vercel. Run `node scripts/check-auth-setup.mjs <email>` to confirm.
6. Nothing else changes: no data migration is needed before the pilot.

## Optional

- Demo data: paste `supabase/seed/seed.sql` into the SQL editor (idempotent). Adds 2 demo partners, 2 listings, 120 days of calendar, a rate card.
- `frontend-design` plugin was installed at project scope for this folder; start Claude Code here for it to load.

## Next engineering steps

1. Apply `20261008100000_job_leases.sql` in the SQL editor, then finish the near-calendar pass:
   `node scripts/run-job.mjs sync-calendar-near` until the run notes say "pass complete" (3 runs for 129 listings).
   Then eyeball `/search` with dates and a few listing pages for payload drift (`hostaway.parse_failed` in the log).
2. Week 2 remaining: partner rate cards applied in `priceStay` (+ `/admin/rate-cards`), Resend key + templates for
   approved / declined / counter emails, `/team` and `/admin/partners` (invite UI over the existing API), SLA
   escalation job, `drain-webhooks`, partner withdraw of a SUBMITTED request (needs a spec decision), basket
   (multi-property, all-or-nothing) if still wanted for the pilot.
3. Week 3: Stripe deposit/authorisation, invoices, check-in access pack release, reconcile jobs, pilot polish, cut over
   to the client's Supabase (checklist above) and deploy to Vercel.
4. Business decisions in `docs/DECISIONS-REQUIRED.md` (GST treatment, rate card structure, hold policy, etc.).

## Commands

npm run dev · npm run typecheck · npm run lint · npm run test:unit · npm run guard:service-role · npm run build
