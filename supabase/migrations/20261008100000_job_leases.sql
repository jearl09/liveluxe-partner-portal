-- Job leases replace session advisory locks (spec §3.2, §17.5).
--
-- pg_try_advisory_lock() is bound to the Postgres SESSION. Supabase's REST layer
-- runs each RPC on a pooled connection, so the later unlock frequently executes on a
-- different session and the lock leaks until that connection is recycled — observed
-- on 2026-10-08 as "skipped: lock held by another invocation" for a job that had
-- finished a second earlier. A lease row with an expiry has no such dependency and
-- self-heals if a serverless invocation dies mid-run.

create table if not exists job_leases (
  key        text primary key,
  holder     text not null,
  expires_at timestamptz not null,
  acquired_at timestamptz not null default now()
);
alter table job_leases enable row level security;
-- No policies: only the service role (which bypasses RLS) touches this table.

-- Returns true when `p_holder` now holds the lease for `p_key` (fresh, renewed, or expired-and-taken).
create or replace function job_lease_acquire(p_key text, p_holder text, p_ttl_seconds int)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_holder text;
begin
  insert into job_leases (key, holder, expires_at, acquired_at)
  values (p_key, p_holder, now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (key) do update
    set holder = excluded.holder,
        expires_at = excluded.expires_at,
        acquired_at = excluded.acquired_at
    where job_leases.expires_at < now() or job_leases.holder = excluded.holder
  returning holder into v_holder;
  return v_holder = p_holder;
end;
$$;

create or replace function job_lease_release(p_key text, p_holder text)
returns boolean language sql volatile security definer set search_path = public as $$
  with d as (delete from job_leases where key = p_key and holder = p_holder returning 1)
  select exists (select 1 from d);
$$;

revoke execute on function job_lease_acquire(text, text, int) from public, anon, authenticated;
revoke execute on function job_lease_release(text, text) from public, anon, authenticated;

-- The session-scoped helpers are unsafe behind a connection pool; remove them so nothing new uses them.
drop function if exists try_advisory_lock(text);
drop function if exists release_advisory_lock(text);
