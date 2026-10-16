-- Dates taken in the portal that the synced calendar does not show yet (property page date picker, quote check).
--
-- A pending request holds its dates (inventory_holds) and an approved booking consumes them before Hostaway's
-- calendar catches up. RLS lets a partner see only their own organisation's holds and requests, so the picker
-- could offer dates another partner is holding. This returns the date ranges alone, never whose they are, for a
-- listing the caller can see. `p_except_booking` leaves out one request's own hold and booking, so a counter-offer or
-- an extension can price that request's dates.
create or replace function listing_taken_ranges(p_listing_id uuid, p_from date, p_to date, p_except_booking uuid default null)
returns table (start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select lower(r.stay_range), upper(r.stay_range)
  from (
    select h.stay_range from inventory_holds h
    where h.listing_id = p_listing_id and h.expires_at > now()
      and h.booking_id is distinct from p_except_booking
    union all
    select b.stay_range from booking_requests b
    where b.listing_id = p_listing_id and b.status in ('APPROVED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN')
      and b.id is distinct from p_except_booking
  ) r
  where r.stay_range && daterange(p_from, p_to, '[)')
    and exists (
      select 1 from listings l
      where l.id = p_listing_id and (public.jwt_is_livluxe() or (l.is_active and l.is_partner_visible))
    )
$$;
revoke execute on function listing_taken_ranges(uuid, date, date, uuid) from public, anon;
grant execute on function listing_taken_ranges(uuid, date, date, uuid) to authenticated, service_role;
