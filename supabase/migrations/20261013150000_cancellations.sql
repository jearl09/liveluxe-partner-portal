-- Cancellations and refunds (spec §10.3, §11.6, Appendix B).
--
-- 1. booking_requests: a partner's after-cut-off cancellation *request* and the
--    money outcome of a cancellation are recorded on the row.
-- 2. refunds: mirror Stripe refund status; link the credit note issued against
--    the booking's invoice.
-- 3. apply_booking_transition: partners may withdraw a pending request or cancel
--    a confirmed booking (the cut-off is enforced in the application).
-- 4. cancellation_policy(): partner-safe read of the two cancellation tunables.

alter table booking_requests
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_requested_by uuid references partner_users(id),
  add column if not exists cancellation_reason        text,
  add column if not exists cancel_refund_cents        bigint,
  add column if not exists cancel_retained_cents      bigint;

alter table refunds
  add column if not exists status               text not null default 'pending',
  add column if not exists stripe_credit_note_id text,
  add column if not exists failure_reason       text,
  add column if not exists updated_at           timestamptz not null default now();

create index if not exists refunds_booking_idx on refunds (booking_id, created_at desc);

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

-- ---------------------------------------------------------------------------
-- Partner-safe read of the cancellation tunables (partners cannot read settings).
-- ---------------------------------------------------------------------------
create or replace function cancellation_policy()
returns table (cutoff_days int, retention_schedule jsonb)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select (s.value::text)::int from settings s where s.key = 'cancellation.cutoff_days'), 14),
    coalesce((select s.value from settings s where s.key = 'cancellation.retention_schedule'), '[]'::jsonb);
$$;
revoke execute on function cancellation_policy() from public, anon;
grant execute on function cancellation_policy() to authenticated;
