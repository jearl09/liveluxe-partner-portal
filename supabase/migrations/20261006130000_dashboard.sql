-- =============================================================================
-- Partner dashboard support (spec §13.1 "/", §13.5)
--   1. partner_orgs.logo_url for the co-branded header
--   2. availability freshness readable by partners without exposing sync_runs
--   3. the stale threshold as a tunable in `settings`
-- =============================================================================

alter table partner_orgs add column if not exists logo_url text;

insert into settings (key, value, description) values
  ('sync.stale_after_minutes', '30', 'Show "availability may be stale" when the last calendar sync is older than this')
on conflict (key) do nothing;

-- sync_runs is Livluxe-only under RLS; partners need just one number from it.
-- Returns the last successful calendar/listing sync and the stale threshold.
create or replace function public.availability_freshness()
returns table (last_synced_at timestamptz, stale_after_minutes int)
language sql stable security definer set search_path = public as $$
  select
    (select max(finished_at) from sync_runs where status = 'succeeded' and job in ('sync-listings','sync-calendar-near','sync-calendar-far')),
    coalesce((select (value #>> '{}')::int from settings where key = 'sync.stale_after_minutes'), 30);
$$;
grant execute on function public.availability_freshness() to authenticated;
