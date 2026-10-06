# Getting started

This walks a new engineer from a clean machine to a running local stack and a green test suite.

## 1. Prerequisites

| Tool           | Version                                      | Notes                                        |
| -------------- | -------------------------------------------- | -------------------------------------------- |
| Node.js        | 24 (see `.nvmrc`)                            | `nvm install 24 && nvm use`                  |
| npm            | 11+                                          | ships with Node 24                           |
| Docker Desktop | current                                      | required by `supabase start`                 |
| Supabase CLI   | bundled as a dev dependency (`npx supabase`) | or install globally                          |
| Stripe CLI     | current                                      | `stripe login`, then `npm run stripe:listen` |
| Git            | any                                          |                                              |

## 2. Accounts and credentials you will need

Ask the project owner for, or create, the following **before** Phase 1:

1. **Supabase** — a project in `ap-southeast-2` (Sydney) for staging, another for production. Local dev uses the Docker stack.
2. **Hostaway TEST account** — separate Account ID + API key. _Never_ point non-production at the live account (spec §5.1).
3. **Stripe** — test-mode keys for local/preview/staging; live keys only in Vercel production env.
4. **Resend** — API key + verified sending subdomain (SPF/DKIM/DMARC).
5. **MapTiler or Mapbox** — domain-restricted tile key.
6. **Vercel** — project linked to this repo; functions pinned to `syd1` (already in `vercel.json`).
7. **Slack** — incoming webhooks for `#bookings` and `#alerts` (optional locally).
8. **Sentry** — DSN (optional locally).

## 3. Local setup

```bash
git clone <repo> livluxe-partner-portal && cd livluxe-partner-portal
nvm use
npm install
cp .env.example .env.local
npm run db:start          # prints API URL, anon key, service_role key → paste into .env.local
npm run db:reset          # applies supabase/migrations + supabase/seed/seed.sql
npm run db:types          # regenerates lib/db/types.ts from the live schema
npm run dev
```

Open http://localhost:3000 — you will be redirected to `/login`.

### Enabling the JWT claims hook (once per Supabase project)

The RLS policies read `org_id` and `user_role` from the JWT (`role` is reserved by Supabase for the Postgres role). The migration creates
`public.custom_access_token_hook`; enable it under **Authentication → Hooks → Customize Access Token (JWT) Claims**
and select that function. Locally, add to `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

### Enabling TOTP multi-factor authentication (once per Supabase project)

MFA is optional and turned on per user from Settings → Security. Enrolment at `/mfa/enrol`
calls the Supabase MFA API, which must be switched on: **Authentication → Multi-Factor → TOTP → Enabled**. Locally:

```toml
[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true
```

### Password-reset email template (once per Supabase project)

Supabase sends the recovery email; the link must land on our callback so the session is created in cookies.
Under **Authentication → Email Templates → Reset password**, make the button href:

```
{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password/confirm
```

and set **Site URL** (Authentication → URL Configuration) to the app origin, with `/api/auth/callback` in the
redirect allow-list. The default `{{ .ConfirmationURL }}` also works because `resetPasswordForEmail` passes
`redirectTo=/api/auth/callback?next=/reset-password/confirm`, provided that URL is allow-listed.

### Login rate limiting needs the Phase 0 migration

`supabase/migrations/20261006120000_phase0_auth.sql` creates `auth_rate_limit_hit()`, `invitation_preview()` and
`accept_invitation()`. The sign-in route **fails open** when the limiter is unavailable, so logins work unlimited and the server logs
`auth.rate_limit_unavailable` until the migration is applied. Hosted projects: paste the file into the SQL editor.

### Creating the first users

Auth users cannot be created from SQL seed. For local dev, use Supabase Studio (http://127.0.0.1:54323) →
Authentication → Add user, then insert a matching `partner_users` row with `status = 'active'`:

```sql
insert into partner_users (auth_user_id, org_id, role, email, full_name, status)
values ('<auth user uuid>', '00000000-0000-0000-0000-000000000001', 'livluxe_admin', 'you@livluxe.com.au', 'You', 'active');
```

Then run `node scripts/check-auth-setup.mjs you@livluxe.com.au` — it checks the migration, the user row and the JWT hook
and tells you exactly what is missing.

## 4. Running the checks

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e          # starts the dev server automatically
```

## 5. Stripe webhooks locally

```bash
stripe login
npm run stripe:listen     # prints whsec_… → STRIPE_WEBHOOK_SECRET in .env.local
stripe trigger payment_intent.amount_capturable_updated
```

## 6. Hostaway webhooks locally

Hostaway rejects internal hosts, so expose the dev server with a tunnel (ngrok or Cloudflare Tunnel) and register
`https://<tunnel>/api/webhooks/hostaway/<HOSTAWAY_WEBHOOK_PATH_SECRET>` with Basic auth on the **test** account.

## 7. Where to go next

- `docs/DECISIONS-REQUIRED.md` — the twelve business decisions that gate each phase.
- `docs/adr/` — architecture decision records; add one whenever you deviate from the spec.
- `docs/runbooks/` — incident first-actions (spec §19.3).
- `lib/jobs/registry.ts` — every scheduled job and its schedule; each is a `todo()` stub to implement.
- `lib/stripe/webhooks.ts` — every consumed Stripe event; each is a stub to implement.
