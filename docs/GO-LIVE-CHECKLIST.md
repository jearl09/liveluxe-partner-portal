# Go-live checklist — Livluxe Partner Portal pilot

Target: 24 Oct 2026. Everything below is a dashboard or account action; no code changes are expected.
Tick in order. "Owner" is who can actually do it. Keep every secret in Proton Pass and `.env.local` only.

## 0. State at 14 Oct 2026

- Code complete for the pilot scope; `main` = `422c8b3` deployed to the test site on the engineer's Vercel Hobby
  account and the engineer's Supabase project.
- Email live from `bookings@booking.liveluxe.au` (Resend, DKIM/SPF verified).
- Stripe in **test mode**. Hostaway **read-only** (writes refused outside production by design).
- Business tunables default to the values in `settings` until Angel answers `docs/DECISIONS-REQUIRED.md`.

## 1. Accounts the client must own (Owner: Angel) — the critical path, start today

| Account  | What                                                                                      | Why it takes time                     |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| Supabase | New project, region ap-southeast-2 (Sydney), **Pro** plan (PITR + backups, spec §18.2)    | Card on file, 10 min                  |
| Vercel   | Team on **Pro** plan; invite the engineers                                                | Hobby allows 2 daily crons; we run 14 |
| Stripe   | Live-mode activation for Live Luxe Pty Ltd (ABN 16 678 772 613), bank account for payouts | Identity/business verification, 1–3 d |
| Hostaway | Production API key named "Partner portal" with write scope, from the live account         | Hostaway support may need to confirm  |
| Resend   | Already done under contact@liveluxeau.com; add Angel as owner                             | 2 min                                 |

Without Vercel Pro the hold-expiry, webhook-drain, SLA and check-in jobs run once a day instead of every few minutes.
That is not acceptable for a live pilot.

## 2. Supabase cut-over (Owner: engineer with Angel's project access) — about 1 hour

1. SQL editor, run each file in this order, expect "Success" on every one:
   `20261006000000_initial_schema.sql`, `20261006120000_phase0_auth.sql`, `20261006130000_dashboard.sql`,
   `20261008100000_job_leases.sql`, `20261009100000_booking_requests.sql`,
   `20261012100000_rate_cards_partners_sla.sql`, `20261013100000_payments.sql`,
   `20261013150000_cancellations.sql`, `20261013200000_phase4_phase5.sql`, `20261014090000_checkin_pack.sql`,
   `20261016100000_invoice_due_before_checkin.sql`, `20261016120000_tenant_hardening.sql`.
   Do **not** run `supabase/seed/seed.sql` on the client project (demo partners and listings).
2. Authentication → Hooks → Customize Access Token (JWT) Claims → Postgres → `public.custom_access_token_hook` → Save.
3. Authentication → Multi-Factor → TOTP enabled. Authentication → URL configuration: Site URL = the production
   origin; add `<origin>/api/auth/callback` to the redirect allow-list.
4. Create the first `livluxe_admin` auth user and its active `partner_users` row (`docs/GETTING-STARTED.md`).
5. Put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` into Proton Pass and
   `.env.local`. Run `node scripts/check-auth-setup.mjs <admin email>`: all green.
6. Settings table (no admin screen yet; SQL editor): `select key, value, description from settings order by key;`
   and set Angel's answers with `update settings set value = '<json>' where key = '<key>';` for deposit %, hold
   hours, cancellation cut-off and retention tiers, SLA hours, GST rule. Set `hostaway.direct_channel_id` and
   `hostaway.reference_custom_field_id` once Hostaway support confirms them (DECISIONS #7).

## 3. Stripe live mode (Owner: engineer, Angel approves) — 30 min

Account: **Direct Bookings** (Angel, 16 Oct 2026), not "Live Luxe – Enso Connect" or "North Port". If it already takes
payments for the direct booking site, steps 3–4 change settings that site also uses: check with Angel first.

1. Developers → API keys (live): put `STRIPE_SECRET_KEY` (sk_live) and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_live)
   in Proton Pass and `.env.local`. Comment out the test keys above them.
2. Developers → Webhooks → Add endpoint `https://<production origin>/api/webhooks/stripe`, API version default,
   events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`,
   `payment_intent.requires_action`, `payment_intent.amount_capturable_updated`, `invoice.finalized`, `invoice.sent`,
   `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `charge.refunded`,
   `refund.updated`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`,
   `payment_method.attached`, `payment_method.detached`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Settings → Business: legal name, ABN, address (they print on invoices). Settings → Invoices: numbering prefix,
   default payment terms Net 14, footer with ABN and "Tax invoice".
4. Settings → Emails: turn **off** Stripe's own customer emails for successful payments and invoices; the portal
   sends its own.

## 4. Hostaway production (Owner: Angel for the key, engineer for config)

1. `HOSTAWAY_ACCOUNT_ID`, `HOSTAWAY_API_KEY` = the live account's values. `HOSTAWAY_ALLOW_WRITES=true`,
   `HOSTAWAY_WRITE_TARGET=production`. These are only honoured when `VERCEL_ENV=production`.
2. Hostaway → Settings → Webhooks: unified webhook to `https://<origin>/api/webhooks/hostaway/<HOSTAWAY_WEBHOOK_PATH_SECRET>`
   with Basic auth `HOSTAWAY_WEBHOOK_USER` / `HOSTAWAY_WEBHOOK_PASSWORD`.
3. After the first deploy run, in this order, and read the run notes in `sync_runs`:
   `node scripts/run-job.mjs sync-listings` (access packs are written here; needs `ACCESS_DETAILS_KEY`), then
   `sync-calendar-near` until "pass complete", then `sync-calendar-far`.
4. Hide any listing that must not be bookable by partners (SQL editor):
   `update listings set is_partner_visible = false where hostaway_listing_id in (...);` The sync never turns it
   back on.

## 5. Vercel production (Owner: engineer) — 20 min

1. Create the project in the client's Pro team from the GitHub repo, framework Next.js, region Sydney (`syd1` is in
   `vercel.json`). Production branch `main`.
2. Environment variables, Production: run `node scripts/vercel-env-push.mjs --only production` from a machine whose
   `.env.local` holds the live values (it never prints them). Then set by hand `NEXT_PUBLIC_APP_URL` = production
   origin and `VERCEL_ENV` is set by Vercel. Confirm the list matches `.env.example` (including `CRON_SECRET`,
   `ACCESS_DETAILS_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `SLACK_*`).
3. Custom domain, e.g. `partners.liveluxe.au`: add in Vercel, add the CNAME in GoDaddy, wait for the certificate.
   Update `NEXT_PUBLIC_APP_URL`, the Supabase Site URL/redirects, the Stripe and Hostaway webhook URLs to match.
4. Deploy with `vercel deploy --prod` (plain; the Hobby script is only for the test account). Check
   `https://<origin>/api/health` returns `status: ok` and the expected commit.
5. Vercel → Settings → Cron Jobs: all 14 listed and enabled.

## 6. Slack (Owner: Angel) — 10 min

Two incoming webhooks: `#bookings` → `SLACK_WEBHOOK_URL`, `#alerts` → `SLACK_ALERTS_WEBHOOK_URL`. Add the ops team
and finance to both channels.

## 7. First users and partner (Owner: Angel + engineer)

1. Angel signs in, turns on MFA (Settings → Security).
2. `/admin/partners` → create the pilot partner org: legal name, ABN, billing email, payment terms (card or Net 14),
   deposit % if mode B, credit limit, PO/claim-ref requirements.
3. `/admin/rate-cards` → publish the partner's negotiated rates, or leave the default card.
4. Invite the partner admin from the org page. They accept, set a password, optionally MFA, and add their bookers.

## 8. Production smoke test (Owner: engineer with Angel watching) — 45 min, real money, refund at the end

1. Partner: search dates two weeks out, open a listing, request with a real card. Expect the hold in Stripe and the
   request in `/admin/queue` with the SLA clock.
2. Angel: approve. Expect: Hostaway reservation created on the live calendar, card captured, invoice emailed,
   "Confirmed" email to the partner, Slack post.
3. Angel: Release access pack now. Partner sees address, door code and Wi-Fi; ops see the view log.
4. Partner: cancel (outside the cut-off). Expect: Hostaway reservation cancelled, Stripe refund, credit note,
   "Cancelled" email, Slack post, pack hidden.
5. Finance: `/api/admin/reconciliation?format=csv` downloads; next morning the Stripe and Hostaway reconciliation
   jobs show no exceptions in `reconciliation_exceptions`.

## 9. Day-one operations

- Alerts land in `#alerts`; the runbook index is `docs/runbooks/README.md`.
- Jobs: `select job, status, started_at, error from sync_runs order by started_at desc limit 50;` shows the last
  runs; a failed critical job also posts to `#alerts`.
- Backups: Supabase Pro daily + PITR. Stripe and Hostaway remain the sources of truth for money and inventory.
- Rotate `HOSTAWAY_API_KEY` and the Stripe restricted keys every 90 days; rotate `ACCESS_DETAILS_KEY` only with a
  re-sync (`sync-listings` re-encrypts on the next content change; force by clearing `content_hash`).

## 10. Known limits of the pilot build

- No consolidated monthly invoicing, no saved cards (SetupIntent), no Stripe Tax, no SMS.
- Cancelled-upstream detection runs nightly (Hostaway webhooks for reservation changes are not wired).
- The `checkin_pack()` SQL function predates encryption and is unused by the app; do not call it directly.
- Early departure and extensions were verified with in-process fakes, not yet on a live Hostaway account.
