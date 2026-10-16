-- Tenant and role hardening (16 Oct 2026). Found while writing tests/integration/tenant-isolation.test.ts.
--
-- Partner A could never read Partner B's data. These close ways a signed-in partner could, by calling the
-- database API directly with their own session instead of using the portal's screens, change things only
-- Live Luxe or the server should:
--
--   1. A partner admin could issue an invitation for a Live Luxe staff role (e.g. livluxe_admin) in their own
--      organisation, accept it, and gain staff access to every partner's data. Invitations from partner admins
--      are now limited to partner roles, and staff roles are refused outside the internal Live Luxe organisation
--      at the database (trigger on invitations and partner_users).
--   2. A partner could insert or update their own booking requests and quotes directly (any total, dates,
--      or a different org_id). Partners never write these tables directly in the app: submissions go through
--      submit_booking_request() and status changes through apply_booking_transition(). The direct-write
--      policies are removed.
--   3. A partner admin could edit their own organisation row (credit limit, payment terms, status).
--      Only Live Luxe edits organisations in the app; that policy is removed.
--   4. submit_booking_request() trusted the total, tax and decision deadline from its caller and was callable by
--      any signed-in user, skipping the server's pricing and credit gate. It is now callable only by the
--      service role, with the acting user passed in.
--   5. apply_booking_transition() let a partner pass new dates, a new total or a longer hold when accepting a
--      counter-offer or cancelling. Partners may now change the status only.

-- 1. Staff roles live only in the internal organisation; partner admins invite partner roles only.
create or replace function public.enforce_staff_role_internal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role::text like 'livluxe_%'
     and not exists (select 1 from partner_orgs o where o.id = new.org_id and o.is_internal) then
    raise exception 'FORBIDDEN:staff_role_outside_internal_org';
  end if;
  return new;
end $$;

drop trigger if exists partner_users_staff_role_internal on partner_users;
create trigger partner_users_staff_role_internal before insert or update of role, org_id on partner_users
  for each row execute function public.enforce_staff_role_internal();
drop trigger if exists invitations_staff_role_internal on invitations;
create trigger invitations_staff_role_internal before insert or update of role, org_id on invitations
  for each row execute function public.enforce_staff_role_internal();

drop policy if exists invitations_org on invitations;
create policy invitations_org on invitations for all
  using ((org_id = public.jwt_org_id() and public.jwt_role() = 'partner_admin') or public.jwt_role() = 'livluxe_admin')
  with check ((org_id = public.jwt_org_id() and public.jwt_role() = 'partner_admin' and role::text like 'partner_%')
              or public.jwt_role() = 'livluxe_admin');

-- 2. No direct partner writes to booking requests or quotes.
drop policy if exists br_insert_partner on booking_requests;
drop policy if exists br_update_partner on booking_requests;
drop policy if exists quotes_insert on quotes;
create policy quotes_insert on quotes for insert with check (public.jwt_is_livluxe());

-- 3. Organisations are edited by Live Luxe only (org_all_livluxe).
drop policy if exists org_update_admin on partner_orgs;

-- 4. Submission: server only.
drop function if exists submit_booking_request(uuid, date, date, int, int, int, jsonb, bigint, bigint, bigint, bigint, text, uuid, int, text, text, text, text, text, text, text, timestamptz);
create or replace function submit_booking_request(
  p_listing_id uuid,
  p_check_in date,
  p_check_out date,
  p_adults int,
  p_children int,
  p_pets int,
  p_line_items jsonb,
  p_subtotal_cents bigint,
  p_tax_cents bigint,
  p_total_cents bigint,
  p_deposit_cents bigint,
  p_price_hash text,
  p_rate_card_id uuid,
  p_rate_card_version int,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_claim_ref text,
  p_po_number text,
  p_cost_centre text,
  p_notes text,
  p_decision_due_at timestamptz,
  p_auth_user_id uuid default null
) returns table (id uuid, reference text, hold_expires_at timestamptz, decision_due_at timestamptz, quote_id uuid)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_user     partner_users%rowtype;
  v_org      partner_orgs%rowtype;
  v_listing  listings%rowtype;
  v_actor    actor_type;
  v_nights   int := p_check_out - p_check_in;
  v_hold_minutes int;
  v_quote_hours  int;
  v_hold_until   timestamptz;
  v_quote_id     uuid;
  v_booking_id   uuid;
  v_reference    text;
begin
  -- The price, totals and decision deadline arrive from the server, which computed them (§9.4) and ran the
  -- credit gate (§17.2). Only the service role may call this function, so the acting user is passed in.
  select * into v_user from partner_users u where u.auth_user_id = coalesce(auth.uid(), p_auth_user_id) and u.status = 'active';
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  if v_user.role not in ('partner_admin','partner_booker','livluxe_ops','livluxe_finance','livluxe_admin') then
    raise exception 'FORBIDDEN';
  end if;
  v_actor := case when v_user.role::text like 'livluxe_%' then 'livluxe' else 'partner' end;

  select * into v_org from partner_orgs o where o.id = v_user.org_id;
  if v_org.status <> 'active' then raise exception 'ORG_SUSPENDED'; end if;
  if v_org.require_claim_ref and coalesce(p_claim_ref, '') = '' then raise exception 'VALIDATION_FAILED:claim_ref_required'; end if;
  if v_org.require_po_number and coalesce(p_po_number, '') = '' then raise exception 'VALIDATION_FAILED:po_number_required'; end if;

  select * into v_listing from listings l where l.id = p_listing_id and l.is_active and l.is_partner_visible;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_nights < 1 then raise exception 'VALIDATION_FAILED:dates'; end if;
  if coalesce(v_listing.max_guests, 0) < p_adults + p_children or v_listing.max_pets < p_pets then
    raise exception 'CAPACITY_EXCEEDED';
  end if;
  if v_nights < coalesce((select max(c.min_stay) from calendar_days c
                          where c.listing_id = p_listing_id and c.date >= p_check_in and c.date < p_check_out),
                         v_listing.min_nights, 1) then
    raise exception 'MIN_STAY_NOT_MET';
  end if;

  -- Gap-free availability (§15.1): a missing night is unavailable.
  if exists (
    select 1 from generate_series(p_check_in, p_check_out - 1, interval '1 day') d(day)
    left join calendar_days c on c.listing_id = p_listing_id and c.date = d.day::date
    where c.date is null or not (case when c.allotment is not null then c.allotment > 0 else c.is_available end)
  ) then raise exception 'DATES_UNAVAILABLE'; end if;
  if exists (
    select 1 from booking_requests b
    where b.listing_id = p_listing_id
      and b.status in ('APPROVED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN')
      and b.stay_range && daterange(p_check_in, p_check_out, '[)')
  ) then raise exception 'DATES_UNAVAILABLE'; end if;

  -- Expired holds no longer protect anything; clear them so the exclusion constraint sees only live holds.
  delete from inventory_holds h where h.listing_id = p_listing_id and h.expires_at <= now();
  if exists (
    select 1 from inventory_holds h
    where h.listing_id = p_listing_id and h.stay_range && daterange(p_check_in, p_check_out, '[)')
  ) then raise exception 'DATES_HELD'; end if;

  v_hold_minutes := coalesce((select round((s.value::text)::numeric * 60) from settings s where s.key = 'hold.duration_hours'), 48 * 60)::int;
  v_quote_hours  := coalesce(v_org.quote_validity_hours,
                             (select (s.value::text)::int from settings s where s.key = 'quote.validity_hours'), 48);
  v_hold_until   := now() + make_interval(mins => v_hold_minutes);

  insert into quotes (listing_id, org_id, created_by, check_in, check_out, guests_adults, guests_children, guests_pets,
                      line_items, subtotal_cents, tax_cents, total_cents, deposit_cents, currency,
                      rate_card_id, rate_card_version, price_hash, expires_at)
  values (p_listing_id, v_user.org_id, v_user.id, p_check_in, p_check_out, p_adults, p_children, p_pets,
          p_line_items, p_subtotal_cents, p_tax_cents, p_total_cents, p_deposit_cents, v_listing.currency,
          p_rate_card_id, p_rate_card_version, p_price_hash, now() + make_interval(hours => v_quote_hours))
  returning quotes.id into v_quote_id;

  v_reference := next_booking_reference();
  insert into booking_requests (reference, org_id, listing_id, quote_id, created_by, on_behalf_of, status,
                                check_in, check_out, guests_adults, guests_children, guests_pets,
                                guest_name, guest_email, guest_phone, claim_ref, po_number, cost_centre, notes,
                                total_cents, currency, payment_mode, hold_expires_at, decision_due_at, submitted_at)
  values (v_reference, v_user.org_id, p_listing_id, v_quote_id, v_user.id, v_actor = 'livluxe', 'SUBMITTED',
          p_check_in, p_check_out, p_adults, p_children, p_pets,
          nullif(p_guest_name, ''), nullif(p_guest_email, ''), nullif(p_guest_phone, ''),
          nullif(p_claim_ref, ''), nullif(p_po_number, ''), nullif(p_cost_centre, ''), nullif(p_notes, ''),
          p_total_cents, v_listing.currency, v_org.payment_terms, v_hold_until, p_decision_due_at, now())
  returning booking_requests.id into v_booking_id;

  begin
    insert into inventory_holds (listing_id, booking_id, org_id, stay_range, expires_at)
    values (p_listing_id, v_booking_id, v_user.org_id, daterange(p_check_in, p_check_out, '[)'), v_hold_until);
  exception when exclusion_violation then
    raise exception 'DATES_HELD';
  end;

  insert into booking_status_history (booking_id, from_status, to_status, actor_id, actor_type, reason)
  values (v_booking_id, null, 'SUBMITTED', v_user.id, v_actor, 'submitted');
  insert into notifications (user_id, type, payload)
  values (v_user.id, 'request_received',
          jsonb_build_object('requestId', v_booking_id, 'reference', v_reference, 'actor', v_user.full_name));
  insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, after)
  values (v_actor, v_user.id, 'booking.submitted', 'booking_request', v_booking_id::text,
          jsonb_build_object('reference', v_reference, 'total_cents', p_total_cents, 'listing_id', p_listing_id));

  return query select v_booking_id, v_reference, v_hold_until, p_decision_due_at, v_quote_id;
end $$;

revoke execute on function submit_booking_request(uuid, date, date, int, int, int, jsonb, bigint, bigint, bigint, bigint, text, uuid, int, text, text, text, text, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function submit_booking_request(uuid, date, date, int, int, int, jsonb, bigint, bigint, bigint, bigint, text, uuid, int, text, text, text, text, text, text, text, timestamptz, uuid) to service_role;

-- 5. Transitions: partners change the status only.
create or replace function apply_booking_transition(
  p_booking_id uuid,
  p_expected_from booking_status,
  p_to booking_status,
  p_reason text default null,
  p_decline_reason decline_reason default null,
  p_metadata jsonb default null,
  p_new_check_in date default null,
  p_new_check_out date default null,
  p_new_total_cents bigint default null,
  p_new_quote_id uuid default null,
  p_extend_hold_hours int default null
) returns booking_requests
language plpgsql volatile security definer set search_path = public as $$
declare
  v_user    partner_users%rowtype;
  v_actor   actor_type;
  v_actor_id uuid;
  v_booking booking_requests%rowtype;
  v_range   daterange;
  v_notify  text;
begin
  if auth.uid() is null then
    v_actor := 'system';
  else
    select * into v_user from partner_users u where u.auth_user_id = auth.uid() and u.status = 'active';
    if not found then raise exception 'UNAUTHENTICATED'; end if;
    v_actor_id := v_user.id;
    v_actor := case when v_user.role::text like 'livluxe_%' then 'livluxe' else 'partner' end;
  end if;

  select * into v_booking from booking_requests b where b.id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if v_actor = 'partner' then
    if v_booking.org_id <> v_user.org_id or v_user.role not in ('partner_admin','partner_booker') then
      raise exception 'FORBIDDEN';
    end if;
    -- New dates, totals, quotes and hold extensions come only from Live Luxe (a counter-offer) or the system.
    if p_new_check_in is not null or p_new_check_out is not null or p_new_total_cents is not null
       or p_new_quote_id is not null or p_extend_hold_hours is not null then
      raise exception 'FORBIDDEN';
    end if;
    -- Partners may accept or withdraw a counter-offer, withdraw a pending request, or
    -- cancel a confirmed booking (§10.1, §10.3). The cancellation cut-off is enforced
    -- by the application, which is the only caller for CONFIRMED → CANCELLED.
    if not (
      (v_booking.status = 'COUNTER_OFFERED' and p_to in ('UNDER_REVIEW','CANCELLED'))
      or (v_booking.status in ('SUBMITTED','UNDER_REVIEW','AWAITING_PAYMENT','CONFIRMED') and p_to = 'CANCELLED')
    ) then
      raise exception 'FORBIDDEN';
    end if;
  end if;
  if v_booking.status <> p_expected_from then
    raise exception 'INVALID_STATE_TRANSITION:%', v_booking.status;
  end if;

  v_range := daterange(coalesce(p_new_check_in, v_booking.check_in), coalesce(p_new_check_out, v_booking.check_out), '[)');

  begin
    update booking_requests b set
      status        = p_to,
      check_in      = coalesce(p_new_check_in, b.check_in),
      check_out     = coalesce(p_new_check_out, b.check_out),
      total_cents   = coalesce(p_new_total_cents, b.total_cents),
      quote_id      = coalesce(p_new_quote_id, b.quote_id),
      assigned_to   = case when v_actor = 'livluxe' and b.assigned_to is null then v_actor_id else b.assigned_to end,
      approved_at   = case when p_to = 'APPROVED' then now() else b.approved_at end,
      approved_by   = case when p_to = 'APPROVED' then v_actor_id else b.approved_by end,
      confirmed_at  = case when p_to = 'CONFIRMED' then now() else b.confirmed_at end,
      declined_at   = case when p_to = 'DECLINED' then now() else b.declined_at end,
      decline_reason = case when p_to = 'DECLINED' then p_decline_reason else b.decline_reason end,
      decline_notes  = case when p_to = 'DECLINED' then p_reason else b.decline_notes end,
      cancelled_at  = case when p_to = 'CANCELLED' then now() else b.cancelled_at end,
      sla_paused_at = case when p_to = 'COUNTER_OFFERED' then now()
                           when p_to = 'UNDER_REVIEW' and b.status = 'COUNTER_OFFERED' then null
                           else b.sla_paused_at end,
      hold_expires_at = case when p_extend_hold_hours is not null then now() + make_interval(hours => p_extend_hold_hours)
                             when p_to in ('DECLINED','CANCELLED','EXPIRED','CONFIRMED') then null
                             else b.hold_expires_at end
    where b.id = p_booking_id
    returning * into v_booking;
  exception when exclusion_violation then
    raise exception 'DATES_UNAVAILABLE';
  end;

  if p_to in ('DECLINED','CANCELLED','EXPIRED','CONFIRMED') then
    delete from inventory_holds h where h.booking_id = p_booking_id;
  elsif p_new_check_in is not null or p_new_check_out is not null or p_extend_hold_hours is not null then
    begin
      update inventory_holds h
        set stay_range = v_range,
            expires_at = coalesce(v_booking.hold_expires_at, h.expires_at)
      where h.booking_id = p_booking_id;
    exception when exclusion_violation then
      raise exception 'DATES_HELD';
    end;
  end if;

  insert into booking_status_history (booking_id, from_status, to_status, actor_id, actor_type, reason, metadata)
  values (p_booking_id, p_expected_from, p_to, v_actor_id, v_actor, p_reason, p_metadata);

  v_notify := case p_to
    when 'APPROVED' then 'request_approved'
    when 'DECLINED' then 'request_declined'
    when 'COUNTER_OFFERED' then 'counter_offer'
    when 'EXPIRED' then 'request_expired'
    when 'CONFIRMED' then 'request_confirmed'
    when 'CANCELLED' then 'request_cancelled'
    else null end;
  if v_notify is not null then
    insert into notifications (user_id, type, payload)
    values (v_booking.created_by, v_notify,
            jsonb_build_object('requestId', p_booking_id, 'reference', v_booking.reference,
                               'actor', coalesce(v_user.full_name, 'Live Luxe')));
  end if;

  insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, before, after)
  values (v_actor, v_actor_id, 'booking.' || lower(p_to::text), 'booking_request', p_booking_id::text,
          jsonb_build_object('status', p_expected_from), jsonb_build_object('status', p_to, 'reason', p_reason, 'metadata', p_metadata));

  return v_booking;
end $$;
