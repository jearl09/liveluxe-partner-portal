-- Week 2 (second half): partner rate cards, partner onboarding and SLA escalation.
-- Spec §9 (rate cards), §2.3 / §8.1 (partner management, invitations), §10.3 / §21.2 (escalation ladder).

-- ---------------------------------------------------------------------------
-- 1. Rate cards
-- ---------------------------------------------------------------------------

-- The card in force for an organisation on a calendar date (the stay's check-in).
-- Security invoker: RLS still applies, so a partner can only ever resolve their own.
create or replace function public.rate_card_for(p_org_id uuid, p_date date)
returns setof rate_cards
language sql
stable
as $$
  select * from rate_cards
  where org_id = p_org_id and valid_range @> p_date
  limit 1;
$$;

-- Publish a new version of an organisation's rate card from p_valid_from onwards.
-- The currently open card (if any) is closed the day before so the exclusion
-- constraint "one card per org per date" holds. Finance / admin only.
create or replace function public.rate_card_publish(
  p_org_id        uuid,
  p_name          text,
  p_discount_pct  numeric,
  p_los_tiers     jsonb,
  p_fee_overrides jsonb,
  p_fixed_rates   jsonb,
  p_valid_from    date,
  p_valid_to      date default null
)
returns rate_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
  v_actor   uuid;
  v_row     rate_cards;
begin
  if public.jwt_role() not in ('livluxe_finance', 'livluxe_admin') then
    raise exception 'FORBIDDEN';
  end if;
  if p_valid_to is not null and p_valid_to <= p_valid_from then
    raise exception 'VALIDATION_FAILED:valid_to_before_valid_from';
  end if;
  if p_discount_pct < 0 or p_discount_pct > 100 then
    raise exception 'VALIDATION_FAILED:discount_out_of_range';
  end if;

  -- A card that starts on or after the new start date would be fully shadowed: refuse rather than delete history.
  if exists (
    select 1 from rate_cards
    where org_id = p_org_id and lower(valid_range) >= p_valid_from
  ) then
    raise exception 'VALIDATION_FAILED:later_card_exists';
  end if;

  -- Close the card currently in force (its range ends where the new one begins).
  update rate_cards
     set valid_range = daterange(lower(valid_range), p_valid_from, '[)')
   where org_id = p_org_id
     and valid_range @> p_valid_from
     and lower(valid_range) < p_valid_from;

  select coalesce(max(version), 0) + 1 into v_version from rate_cards where org_id = p_org_id;
  select id into v_actor from partner_users where auth_user_id = auth.uid();

  insert into rate_cards (org_id, version, name, discount_pct, fixed_rates, los_tiers, fee_overrides, valid_range, created_by)
  values (
    p_org_id, v_version, p_name, p_discount_pct,
    coalesce(p_fixed_rates, '{}'::jsonb), coalesce(p_los_tiers, '[]'::jsonb), coalesce(p_fee_overrides, '{}'::jsonb),
    daterange(p_valid_from, p_valid_to, '[)'), v_actor
  )
  returning * into v_row;

  insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, after)
  values ('livluxe', v_actor, 'rate_card.published', 'rate_cards', v_row.id, to_jsonb(v_row));

  return v_row;
end;
$$;

grant execute on function public.rate_card_for(uuid, date) to authenticated;
grant execute on function public.rate_card_publish(uuid, text, numeric, jsonb, jsonb, jsonb, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. SLA escalation ladder (§10.3). Highest rung already announced for a request,
--    so each rung fires exactly once however often the job runs.
-- ---------------------------------------------------------------------------
alter table booking_requests
  add column if not exists sla_escalation_pct smallint not null default 0;

comment on column booking_requests.sla_escalation_pct is
  'Highest escalation rung (% of SLA elapsed) already notified; 0 = none. Reset is never needed: terminal states stop the job looking.';

-- Internal (Live Luxe) users who should hear about escalations.
create or replace function public.livluxe_ops_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from partner_users
  where role in ('livluxe_ops', 'livluxe_admin') and status = 'active';
$$;
revoke all on function public.livluxe_ops_user_ids() from public;
