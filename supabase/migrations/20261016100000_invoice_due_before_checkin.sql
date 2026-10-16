-- Mode C invoices fall due no later than N days before check-in (DECISIONS-REQUIRED #3, David, 16 Oct 2026).
-- null = the partner's net terms only.
insert into settings (key, value, description) values
  ('invoice.due_days_before_checkin', '7', 'Mode C: a net-terms invoice is due no later than this many days before check-in (null = terms only)')
on conflict (key) do nothing;
