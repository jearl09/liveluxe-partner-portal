-- Terms written into the quote by staff (David, 20 Oct 2026): 28+ night and peak stays state their
-- exact terms in the quote, not "case by case". Shown to the partner, in the emails and on the invoice.
alter table booking_requests add column if not exists stay_terms text;

insert into settings (key, value, description) values
  ('stay.long_stay_terms_from_nights', '28', 'From this many nights, staff must write the terms into the quote (approval or counter-offer)')
on conflict (key) do nothing;
