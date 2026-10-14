-- Phase 4 close-out and Phase 5 write-back (spec §10.5–10.6, §11, §17.2, §17.3, §21.2).
-- Pure additive: new columns, new tables, new settings rows, one new RPC. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. booking_requests: duplicate-submission key, finance routing, outbox counters,
--    dispute freeze, mode-B deposit, cancelled-upstream, credential purge.
-- ---------------------------------------------------------------------------
alter table booking_requests
  add column if not exists submission_key             text,
  add column if not exists finance_approval_required  boolean not null default false,
  add column if not exists finance_approval_reason    text,
  add column if not exists hostaway_write_attempts    integer not null default 0,
  add column if not exists hostaway_last_error        text,
  add column if not exists confirm_alerted_at         timestamptz,
  add column if not exists refunds_frozen_at          timestamptz,
  add column if not exists payment_deposit_cents      bigint,
  add column if not exists balance_due_at             timestamptz,
  add column if not exists balance_paid_at            timestamptz,
  add column if not exists cancelled_upstream_at      timestamptz,
  add column if not exists checked_in_at              timestamptz,
  add column if not exists completed_at               timestamptz,
  add column if not exists credentials_purge_at       timestamptz,
  add column if not exists credentials_purged_at      timestamptz,
  add column if not exists sla_extended_at            timestamptz;

-- §17.2 duplicate submission: the second call with the same key returns the first result.
create unique index if not exists booking_requests_submission_key
  on booking_requests (org_id, submission_key) where submission_key is not null;

-- ---------------------------------------------------------------------------
-- 2. payments / invoices / refunds / disputes / webhook_events
-- ---------------------------------------------------------------------------
alter table payments
  add column if not exists kind              text not null default 'full',   -- full | deposit | extension
  add column if not exists reminder_sent_at  timestamptz,                    -- 3DS / abandoned-flow resume email
  add column if not exists lapsed_notified_at timestamptz;                   -- authorisation released by the network

alter table invoices
  add column if not exists kind             text not null default 'receipt', -- receipt | net_terms | balance | supplementary
  add column if not exists dunning_stage    integer not null default 0,
  add column if not exists dunning_last_at  timestamptz,
  add column if not exists attempt_count    integer not null default 0;      -- invoice.payment_failed count

alter table disputes
  add column if not exists charge_id            text,
  add column if not exists payment_intent_id    text,
  add column if not exists evidence             jsonb,
  add column if not exists evidence_built_at    timestamptz,
  add column if not exists updated_at           timestamptz not null default now();

-- §17.2 "webhook arrives before the local record": park and retry with backoff.
alter table webhook_events
  add column if not exists next_attempt_at timestamptz,
  add column if not exists parked_reason   text;

-- ---------------------------------------------------------------------------
-- 3. partner_orgs: credit standing driven by dunning (§17.2 "invoice unpaid past terms")
-- ---------------------------------------------------------------------------
alter table partner_orgs
  add column if not exists credit_standing            text not null default 'good', -- good | watch | finance_approval | suspended
  add column if not exists credit_standing_changed_at timestamptz,
  add column if not exists credit_standing_reason     text,
  add column if not exists finance_contact_email      text;

-- ---------------------------------------------------------------------------
-- 4. booking_modifications — the explicit approved modification record §6.7 requires
--    before a stay is lengthened or shortened (extensions, early departure, guest change).
-- ---------------------------------------------------------------------------
create table if not exists booking_modifications (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references booking_requests(id) on delete cascade,
  kind               text not null,                        -- extension | early_departure | guest_change
  status             text not null default 'requested',    -- requested | approved | declined | failed
  requested_by       uuid references partner_users(id),
  decided_by         uuid references partner_users(id),
  old_check_in       date not null,
  old_check_out      date not null,
  new_check_in       date not null,
  new_check_out      date not null,
  delta_cents        bigint not null default 0,            -- + supplementary charge, − refund
  quote_id           uuid references quotes(id),
  reason             text,
  decision_note      text,
  invoice_id         uuid references invoices(id),
  payment_id         uuid references payments(id),
  refund_id          uuid references refunds(id),
  hostaway_status    text,                                 -- updated | skipped | failed
  hostaway_error     text,
  alternatives       jsonb,                                -- listings surfaced when the extension is unavailable
  requested_at       timestamptz not null default now(),
  decided_at         timestamptz,
  updated_at         timestamptz not null default now()
);
create index if not exists booking_modifications_booking on booking_modifications (booking_id, requested_at desc);
alter table booking_modifications enable row level security;
drop policy if exists booking_modifications_select on booking_modifications;
create policy booking_modifications_select on booking_modifications for select
  using (
    public.jwt_is_livluxe()
    or exists (
      select 1 from booking_requests b
      where b.id = booking_modifications.booking_id and b.org_id = public.jwt_org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Reconciliation (§11.6, §17.3 duplicate reservation / cancelled upstream)
-- ---------------------------------------------------------------------------
create table if not exists reconciliation_runs (
  id            uuid primary key default gen_random_uuid(),
  system        text not null,                 -- stripe | hostaway
  period_from   timestamptz,
  period_to     timestamptz,
  summary       jsonb not null default '{}'::jsonb,
  exceptions    integer not null default 0,
  csv           text,
  created_at    timestamptz not null default now()
);
create index if not exists reconciliation_runs_system on reconciliation_runs (system, created_at desc);

create table if not exists reconciliation_exceptions (
  id            uuid primary key default gen_random_uuid(),
  system        text not null,
  kind          text not null,                 -- e.g. confirmed_without_payment, unmatched_balance_txn, duplicate_reservation
  entity_type   text not null,                 -- booking | payment | invoice | refund | balance_transaction | reservation
  entity_id     text not null,
  external_id   text,
  detail        jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  alerted_at    timestamptz,
  resolved_at   timestamptz,
  unique (system, kind, entity_type, entity_id)
);
create index if not exists reconciliation_exceptions_open on reconciliation_exceptions (system, first_seen_at) where resolved_at is null;

alter table reconciliation_runs enable row level security;
drop policy if exists reconciliation_runs_livluxe on reconciliation_runs;
create policy reconciliation_runs_livluxe on reconciliation_runs for select
  using (public.jwt_role() in ('livluxe_finance','livluxe_admin'));
alter table reconciliation_exceptions enable row level security;
drop policy if exists reconciliation_exceptions_livluxe on reconciliation_exceptions;
create policy reconciliation_exceptions_livluxe on reconciliation_exceptions for select
  using (public.jwt_role() in ('livluxe_finance','livluxe_admin'));

-- ---------------------------------------------------------------------------
-- 6. Settings (business tunables, never env vars — §5.3)
-- ---------------------------------------------------------------------------
insert into settings (key, value, description) values
  ('credit.over_limit_action',            '"block"', 'When a submission would exceed the credit limit: block | finance_approval (§17.2)'),
  ('dunning.reminder_days',               '[1,7,14]', 'Days past due on which reminder emails go out'),
  ('dunning.finance_approval_after_days', '14',  'Days past due after which the org''s new bookings need finance approval'),
  ('dunning.suspend_after_days',          '30',  'Days past due after which the org is suspended for new bookings (existing untouched)'),
  ('dunning.failed_attempts_to_finance',  '2',   'invoice.payment_failed count that escalates to finance'),
  ('payment.retry_grace_minutes',         '60',  'Keep the hold at least this long after a card decline so the partner can retry'),
  ('payment.resume_reminder_minutes',     '60',  'Email a resume link when a card flow is abandoned for this long'),
  ('deposit.balance_due_days_before_checkin', '14', 'Mode B: balance invoice is due this many days before check-in'),
  ('approval.ops_value_ceiling_cents',    'null', 'livluxe_ops may approve up to this total; above it finance must approve (null = no ceiling)'),
  ('reconciliation.alert_after_hours',    '24',  'Unmatched reconciliation items older than this raise a HIGH alert'),
  ('confirm.unresolved_alert_minutes',    '5',   'Alert ops when an approved, paid booking has no Hostaway reservation after this long')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Check-in pack (§8.4, §10.6). Partners read the released pack through this
--    function only; every read is logged to checkin_access_log in the same call.
--    Encrypted columns are stored as utf8 bytes until Vault wiring (initial_schema TODO).
-- ---------------------------------------------------------------------------
create or replace function checkin_pack(p_booking_id uuid)
returns table (
  property_name text, address_line text, suburb text, state text, postcode text,
  checkin_from time, checkin_to time, checkout_by time,
  door_code text, wifi_ssid text, wifi_password text, access_instructions text,
  checkin_instructions text, special_instructions text, parking_notes text, emergency_contact text,
  released_at timestamptz
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_user partner_users%rowtype;
  v_b    booking_requests%rowtype;
begin
  select * into v_b from booking_requests b where b.id = p_booking_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if auth.uid() is not null then
    select * into v_user from partner_users u where u.auth_user_id = auth.uid() and u.status = 'active';
    if not found then raise exception 'UNAUTHENTICATED'; end if;
    if v_user.role::text not like 'livluxe_%' and (v_user.org_id <> v_b.org_id or v_user.role not in ('partner_admin','partner_booker','partner_viewer')) then
      raise exception 'FORBIDDEN';
    end if;
  end if;
  if v_b.checkin_released_at is null or v_b.credentials_purged_at is not null
     or v_b.status not in ('CONFIRMED','CHECKED_IN') then
    raise exception 'FORBIDDEN';
  end if;
  insert into checkin_access_log (booking_id, user_id) values (p_booking_id, v_user.id);
  return query
    select l.public_name, l.address_line, l.suburb, l.state, l.postcode,
           l.checkin_from, l.checkin_to, l.checkout_by,
           convert_from(a.door_code_encrypted, 'utf8'), a.wifi_ssid, convert_from(a.wifi_password_encrypted, 'utf8'),
           convert_from(a.access_instructions_encrypted, 'utf8'),
           a.checkin_instructions, a.special_instructions, a.parking_notes, a.emergency_contact,
           v_b.checkin_released_at
    from listings l
    left join listing_access_details a on a.listing_id = l.id
    where l.id = v_b.listing_id;
end $$;
revoke execute on function checkin_pack(uuid) from public, anon;
grant execute on function checkin_pack(uuid) to authenticated;

-- Dunning and reconciliation run as the service role; partners see their own org's standing via partner_orgs RLS.
