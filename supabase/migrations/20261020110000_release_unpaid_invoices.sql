-- A net-terms invoice still unpaid on its due date releases the booking (David, 20 Oct 2026).
-- The partner is warned this many days before the due date, once per invoice.
alter table invoices add column if not exists release_warned_at timestamptz;

insert into settings (key, value, description) values
  ('invoice.release_warning_days', '2', 'Warn the partner this many days before an unpaid net-terms invoice releases the booking')
on conflict (key) do nothing;
