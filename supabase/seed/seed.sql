-- Local development seed. Applied by `supabase db reset` (see supabase/config.toml → db.seed).
-- Creates the internal Livluxe org, one insurance partner, one corporate partner, two demo listings
-- with 120 days of calendar, and a rate card. Auth users must be created separately
-- (`npm run db:seed-users` → scripts/seed-users.ts, TODO phase-0) because auth.users needs the GoTrue API.

insert into partner_orgs (id, name, type, status, abn, email_domains, payment_terms, is_internal, billing_email)
values
  ('00000000-0000-0000-0000-000000000001', 'Live Luxe Pty Ltd', 'other', 'active', '16678772613', '{livluxe.com.au,liveluxeau.com}', 'prepay', true, 'accounts@livluxe.com.au'),
  ('00000000-0000-0000-0000-000000000002', 'Demo Insurance Co', 'insurance', 'active', '11111111111', '{demo-insurance.example}', 'net30', false, 'ap@demo-insurance.example'),
  ('00000000-0000-0000-0000-000000000003', 'Demo Corporate Relocations', 'corporate', 'active', '22222222222', '{demo-corp.example}', 'prepay', false, 'finance@demo-corp.example')
on conflict (id) do nothing;

update partner_orgs set credit_limit_cents = 10000000, require_claim_ref = true, sla_hours = 2
  where id = '00000000-0000-0000-0000-000000000002';
update partner_orgs set require_po_number = true
  where id = '00000000-0000-0000-0000-000000000003';

insert into listings (id, hostaway_listing_id, hostaway_listing_map_id, public_name, internal_name, suburb, state, postcode,
                      geom, geom_public, bedrooms, bathrooms, beds, max_guests, max_pets, base_price_cents,
                      cleaning_fee_cents, guests_included, weekly_discount_pct, monthly_discount_pct, min_nights,
                      checkin_from, checkin_to, checkout_by, suitability_tags)
values
  ('10000000-0000-0000-0000-000000000001', 900001, 800001, 'Bayside 3BR Townhouse', 'PM-ROCKLEA-5A', 'Port Melbourne', 'VIC', '3207',
   st_setsrid(st_makepoint(144.9395, -37.8390), 4326)::geography,
   st_setsrid(st_makepoint(144.9410, -37.8378), 4326)::geography,
   3, 2.5, 4, 6, 0, 31000, 25000, 4, 5, 10, 3, '15:00', '21:00', '10:00', '{insurance,corporate,family}'),
  ('10000000-0000-0000-0000-000000000002', 900002, 800002, 'South Melbourne 2BR Apartment', 'SM-CLARENDON-12', 'South Melbourne', 'VIC', '3205',
   st_setsrid(st_makepoint(144.9580, -37.8330), 4326)::geography,
   st_setsrid(st_makepoint(144.9594, -37.8318), 4326)::geography,
   2, 1, 2, 4, 1, 24000, 18000, 2, 5, 12, 2, '15:00', '20:00', '10:00', '{corporate,pet_friendly}')
on conflict (id) do nothing;

-- 120 days of calendar: weekends +15%, a blocked week on listing 1, a null-price day on listing 2.
insert into calendar_days (listing_id, date, status, is_available, price_cents, min_stay)
select l.id, d::date,
       case when l.id = '10000000-0000-0000-0000-000000000001' and d::date between current_date + 30 and current_date + 36 then 'blocked' else 'available' end::day_status,
       not (l.id = '10000000-0000-0000-0000-000000000001' and d::date between current_date + 30 and current_date + 36),
       case when l.id = '10000000-0000-0000-0000-000000000002' and d::date = current_date + 50 then null
            when extract(isodow from d) in (6,7) then round(l.base_price_cents * 1.15)
            else l.base_price_cents end,
       l.min_nights
from listings l
cross join generate_series(current_date, current_date + 119, interval '1 day') d
on conflict (listing_id, date) do nothing;

insert into rate_cards (org_id, name, discount_pct, fee_overrides, valid_range)
values ('00000000-0000-0000-0000-000000000003', 'Corporate 2026 terms', 12, '{"cleaningFeeFromNights":28}', daterange('2026-01-01','2027-01-01','[)'))
on conflict do nothing;
