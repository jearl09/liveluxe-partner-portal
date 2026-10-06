# Runbooks (spec §19.3)

Each incident gets its own file as the system matures. First actions, transcribed from the spec, so nobody has to find the PDF at 2 am.

## Hostaway integration down

1. Open `/admin/integrations`: check token days-remaining and circuit-breaker state.
2. Verify credentials in the Hostaway dashboard (Settings → Hostaway API). Was the key rotated by someone else?
3. Check Hostaway's status page.
4. Confirm the portal is in degraded mode and shows "availability last confirmed at HH:MM".
5. Disable approvals until reads are trustworthy (`settings` → `approvals.enabled = false` — Phase 5 adds this key).
6. Tell ops that any confirmation needs manual verification in Hostaway until recovery.

## Double booking detected

1. Identify both bookings and which is older (`booking_status_history`, `sync_runs`).
2. **Phone** the affected partner within 15 minutes. Not email.
3. Offer the closest comparable property at no additional cost.
4. Cancel and refund the displaced booking.
5. Root-cause and write it up. Every time.

## Webhook backlog growing

1. `select event_type, state, count(*) from webhook_events where state in ('received','failed') group by 1,2;`
2. Check the `drain-webhooks` job heartbeat in `sync_runs`.
3. Fix, then replay failed events (set `state = 'received'`, `attempts = 0`).
4. Confirm the nightly reconciliation closes any gap.

## Payment captured, Hostaway write failed

1. Confirm no reservation exists (`GET /reservations?listingId=&arrivalStartDate=`).
2. Decide: retry the write, or refund and decline.
3. Contact the partner immediately.
4. Never leave the booking ambiguous overnight.

## Upstream cancellation of a confirmed booking

1. Identify guest and dates.
2. Find replacement inventory **before** contacting anyone.
3. Phone the partner; arrange relocation.
4. Refund or re-invoice the difference.
5. Log the root cause (owner block? channel booking? manual error?).

## Suspected data exposure

1. Preserve logs.
2. Revoke affected sessions; rotate keys (Supabase service role, Hostaway, Stripe webhook secret).
3. Scope the exposure from `audit_log`.
4. Invoke the incident response plan and the Notifiable Data Breaches assessment (30-day window).
5. Notify per the decision tree.

## Cron not running

1. Vercel → Cron logs; `select job, max(started_at) from sync_runs group by job;`
2. Invoke manually: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/<job>`
3. If the advisory lock is stuck from a killed process: `select pg_advisory_unlock_all();` on a fresh connection is not enough — find the holding backend in `pg_locks` and terminate it.
4. Confirm data caught up (jobs are idempotent; a catch-up run is always safe).
