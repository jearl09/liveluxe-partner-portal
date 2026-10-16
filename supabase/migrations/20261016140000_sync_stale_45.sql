-- Availability is shown as possibly out of date after 45 minutes without a calendar sync, not 30: the near-calendar
-- job runs every 15 minutes, so 30 flagged a single slow run (polish pass, 16 Oct 2026).
update settings set value = '45'
where key = 'sync.stale_after_minutes' and value::text = '30';
