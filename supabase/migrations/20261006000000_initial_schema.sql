-- =============================================================================
-- Livluxe Partner Direct Booking Platform — initial schema
-- Spec §7 (data model), §8.3 (RLS), §2.3 (role_permissions), §6.2 (rate limiter)
--
-- Forward-only. All money is bigint cents. All timestamps are timestamptz (UTC).
-- All PKs are uuid except calendar_days (natural key) and settings (text key).
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "btree_gist";
create extension if not exists "postgis";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
create type partner_type   as enum ('insurance','corporate','government','other');
exception when duplicate_object then null; end $$;
do $$ begin
create type org_status     as enum ('active','suspended','pending','closed');
exception when duplicate_object then null; end $$;
do $$ begin
create type user_role      as enum ('partner_admin','partner_booker','partner_viewer','partner_finance',
                                    'livluxe_ops','livluxe_finance','livluxe_admin');
exception when duplicate_object then null; end $$;
do $$ begin
create type user_status    as enum ('invited','active','disabled');
exception when duplicate_object then null; end $$;
do $$ begin
create type booking_status as enum ('DRAFT','SUBMITTED','UNDER_REVIEW','COUNTER_OFFERED','APPROVED',
                                    'AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','COMPLETED',
                                    'DECLINED','EXPIRED','CANCELLED','FAILED');
exception when duplicate_object then null; end $$;
do $$ begin
create type day_status     as enum ('available','blocked','reserved','pending','unknown');
exception when duplicate_object then null; end $$;
do $$ begin
create type actor_type     as enum ('partner','livluxe','system');
exception when duplicate_object then null; end $$;
do $$ begin
create type comment_visibility as enum ('shared','internal');
exception when duplicate_object then null; end $$;
do $$ begin
create type webhook_source as enum ('stripe','hostaway');
exception when duplicate_object then null; end $$;
do $$ begin
create type webhook_state  as enum ('received','processing','processed','failed','skipped');
exception when duplicate_object then null; end $$;
do $$ begin
create type sync_status    as enum ('running','succeeded','failed','skipped');
exception when duplicate_object then null; end $$;
do $$ begin
create type payment_terms  as enum ('prepay','deposit','net14','net30');
exception when duplicate_object then null; end $$;
do $$ begin
create type decline_reason as enum ('no_availability','unsuitable_property','owner_block','commercial_terms',
                                    'guest_profile','maintenance','other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- JWT claim helpers (populated by the custom access token hook below).
-- Live in public: hosted Supabase does not allow creating objects in the auth schema.
-- ---------------------------------------------------------------------------
create or replace function public.jwt_org_id() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'org_id','')::uuid $$;
create or replace function public.jwt_role() returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::json->>'user_role' $$;
create or replace function public.jwt_is_livluxe() returns boolean language sql stable as $$
  select coalesce(public.jwt_role() like 'livluxe%', false) $$;

-- ---------------------------------------------------------------------------
-- Partners
-- ---------------------------------------------------------------------------
create table partner_orgs (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  type                     partner_type not null,
  status                   org_status not null default 'pending',
  abn                      text,
  email_domains            text[] not null default '{}',
  stripe_customer_id       text unique,
  payment_terms            payment_terms not null default 'prepay',
  credit_limit_cents       bigint,
  deposit_pct              numeric(5,2),
  require_po_number        boolean not null default false,
  require_claim_ref        boolean not null default false,
  auto_approve_under_cents bigint,
  sla_hours                numeric(5,2),                -- null = global default from settings
  hard_holds               boolean not null default false,
  quote_validity_hours     integer,
  billing_email            citext,
  billing_contact_name     text,
  default_po_number        text,
  default_cost_centre      text,
  is_internal              boolean not null default false, -- the Livluxe org itself
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table partner_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  org_id        uuid not null references partner_orgs(id),
  role          user_role not null,
  email         citext not null,
  full_name     text,
  phone         text,
  status        user_status not null default 'invited',
  invited_by    uuid references partner_users(id),
  invited_at    timestamptz,
  accepted_at   timestamptz,
  last_seen_at  timestamptz,
  mfa_enrolled  boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index partner_users_org_email on partner_users (org_id, email);

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references partner_orgs(id),
  email       citext not null,
  role        user_role not null,
  token_hash  text not null unique,       -- never store the plaintext token
  invited_by  uuid references partner_users(id),
  expires_at  timestamptz not null,       -- 7-day TTL
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create table partner_documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references partner_orgs(id),
  type         text not null,              -- coi | authority_to_book | po | other
  storage_path text not null,
  file_name    text not null,
  expires_at   date,
  verified_by  uuid references partner_users(id),
  verified_at  timestamptz,
  uploaded_by  uuid references partner_users(id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Role / permission matrix (spec §2.3) — the single source of truth
-- ---------------------------------------------------------------------------
create table role_permissions (
  role       user_role not null,
  capability text not null,
  primary key (role, capability)
);

-- ---------------------------------------------------------------------------
-- Listings (mirror of Hostaway) and calendar cache
-- ---------------------------------------------------------------------------
create table listings (
  id                      uuid primary key default gen_random_uuid(),
  hostaway_listing_id     bigint not null unique,
  hostaway_listing_map_id bigint,
  public_name             text not null,
  internal_name           text,
  description_html        text,
  house_rules             text,
  address_line            text,
  suburb                  text,
  state                   text,
  postcode                text,
  country_code            text not null default 'AU',
  geom                    geography(Point,4326),
  geom_public             geography(Point,4326),   -- deterministic 100–200 m jitter, partner-visible pre-approval
  timezone                text not null default 'Australia/Melbourne',
  bedrooms                smallint,
  bathrooms               numeric(3,1),
  beds                    smallint,
  bed_config              jsonb,
  max_guests              smallint,
  max_pets                smallint not null default 0,
  property_type           text,
  area_sqm                numeric(7,1),
  base_price_cents        bigint,
  currency                char(3) not null default 'AUD',
  cleaning_fee_cents      bigint not null default 0,
  extra_person_fee_cents  bigint not null default 0,
  guests_included         smallint not null default 1,
  security_deposit_cents  bigint not null default 0,
  weekly_discount_pct     numeric(5,2) not null default 0,
  monthly_discount_pct    numeric(5,2) not null default 0,
  min_nights              smallint not null default 1,
  max_nights              smallint,
  checkin_from            time,
  checkin_to              time,
  checkout_by             time,
  hostaway_status         text,
  is_active               boolean not null default true,
  is_partner_visible      boolean not null default true,
  suitability_tags        text[] not null default '{}',
  partner_notes           text,
  min_turnover_hours      integer,
  checkin_release_offset_hours integer,            -- per-property override of the T-48h default
  content_hash            text,
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index listings_geom_gist on listings using gist (geom);
create index listings_geom_public_gist on listings using gist (geom_public);
create index listings_active_visible on listings (is_active, is_partner_visible);
create index listings_suburb_state on listings (suburb, state);
create index listings_suburb_trgm on listings using gin (suburb gin_trgm_ops);

create table listing_images (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  url        text not null,             -- Hostaway CDN URL
  storage_path text,                    -- mirrored copy in Supabase Storage
  caption    text,
  sort_order integer not null default 0
);
create index listing_images_listing on listing_images (listing_id, sort_order);

create table listing_amenities (
  listing_id   uuid not null references listings(id) on delete cascade,
  amenity_code text not null,
  label        text,
  primary key (listing_id, amenity_code)
);

-- SENSITIVE: separated so ordinary listing queries never touch it; RLS is maximally restrictive.
create table listing_access_details (
  listing_id             uuid primary key references listings(id) on delete cascade,
  door_code_encrypted    bytea,
  wifi_ssid              text,
  wifi_password_encrypted bytea,
  access_instructions_encrypted bytea,
  checkin_instructions   text,
  special_instructions   text,
  parking_notes          text,
  emergency_contact      text,
  updated_at             timestamptz not null default now()
);

create table calendar_days (
  listing_id          uuid not null references listings(id) on delete cascade,
  date                date not null,
  status              day_status not null default 'unknown',
  is_available        boolean not null default false,
  allotment           integer,
  price_cents         bigint,                        -- NULL = unknown; never default
  min_stay            smallint,
  closed_on_arrival   boolean not null default false,
  closed_on_departure boolean not null default false,
  reservation_ref     text,
  source_synced_at    timestamptz not null default now(),
  primary key (listing_id, date)
);
create index calendar_days_available_date on calendar_days (date) where is_available;
create index calendar_days_covering on calendar_days (listing_id, date) include (price_cents, min_stay);

-- ---------------------------------------------------------------------------
-- Commercial terms
-- ---------------------------------------------------------------------------
create table rate_cards (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references partner_orgs(id),
  version        integer not null default 1,
  name           text not null,
  discount_pct   numeric(5,2) not null default 0,
  fixed_rates    jsonb not null default '{}'::jsonb,   -- { byListingId: {...}, byTag: {...} }
  los_tiers      jsonb not null default '[]'::jsonb,   -- [{ minNights, discountPct }]
  fee_overrides  jsonb not null default '{}'::jsonb,   -- { cleaningFeeFromNights, waiveSecurityDeposit }
  valid_range    daterange not null,
  created_by     uuid references partner_users(id),
  created_at     timestamptz not null default now(),
  -- exactly one effective card per org on any given date
  exclude using gist (org_id with =, valid_range with &&)
);

-- ---------------------------------------------------------------------------
-- Quotes (immutable), requests, holds, history, comments
-- ---------------------------------------------------------------------------
create table quotes (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references listings(id),
  org_id           uuid not null references partner_orgs(id),
  created_by       uuid references partner_users(id),
  check_in         date not null,
  check_out        date not null,
  guests_adults    smallint not null default 1,
  guests_children  smallint not null default 0,
  guests_pets      smallint not null default 0,
  line_items       jsonb not null,
  subtotal_cents   bigint not null,
  tax_cents        bigint not null default 0,
  total_cents      bigint not null,
  deposit_cents    bigint not null default 0,
  currency         char(3) not null default 'AUD',
  rate_card_id     uuid references rate_cards(id),
  rate_card_version integer,
  price_hash       text not null,
  expires_at       timestamptz not null,
  supersedes_id    uuid references quotes(id),
  created_at       timestamptz not null default now()
);
create index quotes_org_created on quotes (org_id, created_at desc);

create sequence booking_reference_seq;

create table booking_requests (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,       -- LLX-2026-004182
  org_id                  uuid not null references partner_orgs(id),
  listing_id              uuid not null references listings(id),
  quote_id                uuid references quotes(id),
  basket_id               uuid,                       -- groups multi-property submissions (all-or-nothing)
  created_by              uuid not null references partner_users(id),
  on_behalf_of            boolean not null default false,
  assigned_to             uuid references partner_users(id),
  status                  booking_status not null default 'DRAFT',
  check_in                date not null,
  check_out               date not null,
  nights                  integer generated always as (check_out - check_in) stored,
  stay_range              daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  guests_adults           smallint not null default 1,
  guests_children         smallint not null default 0,
  guests_pets             smallint not null default 0,
  guest_name              text,
  guest_email             citext,
  guest_phone             text,
  claim_ref               text,
  po_number               text,
  cost_centre             text,
  notes                   text,
  total_cents             bigint,
  currency                char(3) not null default 'AUD',
  payment_mode            payment_terms,
  hold_expires_at         timestamptz,
  decision_due_at         timestamptz,
  sla_paused_at           timestamptz,
  decline_reason          decline_reason,
  decline_notes           text,
  hostaway_reservation_id bigint,
  hostaway_write_key      text,
  hostaway_write_attempted_at timestamptz,
  hostaway_written_at     timestamptz,
  checkin_released_at     timestamptz,
  submitted_at            timestamptz,
  approved_at             timestamptz,
  approved_by             uuid references partner_users(id),
  confirmed_at            timestamptz,
  declined_at             timestamptz,
  cancelled_at            timestamptz,
  cancelled_upstream      boolean not null default false,
  linked_request_id       uuid references booking_requests(id),  -- reopen / extension lineage
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint chk_dates   check (check_out > check_in),
  constraint chk_horizon check (check_in >= current_date - 1),
  -- §7.2.1 — the structural guarantee against double-booking
  constraint no_overlapping_live_bookings
    exclude using gist (listing_id with =, stay_range with &&)
    where (status in ('APPROVED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN'))
);
create index booking_requests_status_due on booking_requests (status, decision_due_at);
create index booking_requests_org_created on booking_requests (org_id, created_at desc);
create index booking_requests_listing_dates on booking_requests (listing_id, check_in, check_out);
create index booking_requests_claim_po on booking_requests (claim_ref, po_number);

create table inventory_holds (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings(id) on delete cascade,
  booking_id  uuid references booking_requests(id) on delete cascade,
  org_id      uuid not null references partner_orgs(id),
  stay_range  daterange not null,
  hard        boolean not null default false,       -- true = also blocked in Hostaway
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  exclude using gist (listing_id with =, stay_range with &&)
);
create index inventory_holds_expires on inventory_holds (expires_at);

create table booking_status_history (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references booking_requests(id) on delete cascade,
  from_status booking_status,
  to_status   booking_status not null,
  actor_id    uuid references partner_users(id),
  actor_type  actor_type not null,
  reason      text,
  metadata    jsonb,
  ip          inet,
  occurred_at timestamptz not null default now()
);
create index booking_status_history_booking on booking_status_history (booking_id, occurred_at);

create table booking_comments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references booking_requests(id) on delete cascade,
  author_id   uuid not null references partner_users(id),
  body        text not null,
  visibility  comment_visibility not null default 'shared',
  edit_history jsonb not null default '[]'::jsonb,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index booking_comments_booking on booking_comments (booking_id, created_at);

create table booking_documents (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references booking_requests(id) on delete cascade,
  uploaded_by  uuid references partner_users(id),
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   integer,
  scanned_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table checkin_access_log (
  id         bigint generated always as identity primary key,
  booking_id uuid not null references booking_requests(id) on delete cascade,
  user_id    uuid references partner_users(id),
  ip         inet,
  user_agent text,
  viewed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stripe mirrors (gold entities in Figure 3)
-- ---------------------------------------------------------------------------
create table payments (
  id                        uuid primary key default gen_random_uuid(),
  booking_id                uuid not null references booking_requests(id),
  stripe_payment_intent_id  text not null unique,
  status                    text not null,
  amount_authorised_cents   bigint not null default 0,
  amount_captured_cents     bigint not null default 0,
  currency                  char(3) not null default 'AUD',
  method_type               text,
  card_last4                text,
  authorised_at             timestamptz,
  captured_at               timestamptz,
  failure_code              text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table invoices (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid references booking_requests(id),
  org_id             uuid not null references partner_orgs(id),
  stripe_invoice_id  text not null unique,
  number             text,
  status             text not null,
  amount_due_cents   bigint not null,
  amount_paid_cents  bigint not null default 0,
  currency           char(3) not null default 'AUD',
  due_at             timestamptz,
  hosted_url         text,
  pdf_url            text,
  sent_at            timestamptz,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table refunds (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references booking_requests(id),
  payment_id       uuid references payments(id),
  stripe_refund_id text not null unique,
  amount_cents     bigint not null,
  reason           text,
  approved_by      uuid references partner_users(id),
  created_at       timestamptz not null default now()
);

create table disputes (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid references booking_requests(id),
  stripe_dispute_id text not null unique,
  status            text not null,
  amount_cents      bigint not null,
  reason            text,
  opened_at         timestamptz,
  closed_at         timestamptz
);

-- ---------------------------------------------------------------------------
-- Operational tables
-- ---------------------------------------------------------------------------
create table audit_log (
  id              bigint generated always as identity primary key,
  actor_type      actor_type not null,
  actor_id        uuid,
  impersonated_by uuid,
  action          text not null,
  entity_type     text not null,
  entity_id       text,
  before          jsonb,
  after           jsonb,
  ip              inet,
  user_agent      text,
  request_id      text,
  occurred_at     timestamptz not null default now()
);
create index audit_log_entity on audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_actor on audit_log (actor_id, occurred_at desc);
-- Append-only: no UPDATE or DELETE grant to any role.
revoke update, delete on audit_log from public, anon, authenticated;

create table webhook_events (
  id           uuid primary key default gen_random_uuid(),
  source       webhook_source not null,
  event_type   text not null,
  external_id  text not null,
  payload      jsonb not null,
  state        webhook_state not null default 'received',
  attempts     integer not null default 0,
  last_error   text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (source, external_id)              -- free idempotency
);
create index webhook_events_pending on webhook_events (received_at) where state in ('received','failed');

create table sync_runs (
  id               uuid primary key default gen_random_uuid(),
  job              text not null,
  status           sync_status not null default 'running',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  records_examined integer not null default 0,
  records_changed  integer not null default 0,
  api_calls        integer not null default 0,
  error            text,
  checkpoint       jsonb
);
create index sync_runs_job_started on sync_runs (job, started_at desc);

create table integration_tokens (
  provider     text primary key,
  access_token text not null,                -- TODO: move to Supabase Vault / pgsodium before production
  issued_at    timestamptz not null,
  expires_at   timestamptz not null
);

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references partner_users(id) on delete cascade,
  type          text not null,
  payload       jsonb not null,
  read_at       timestamptz,
  email_sent_at timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_user_unread on notifications (user_id, created_at desc) where read_at is null;

create table saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references partner_users(id) on delete cascade,
  org_id     uuid not null references partner_orgs(id),
  name       text not null,
  filters    jsonb not null,
  alert      boolean not null default false,
  created_at timestamptz not null default now()
);

-- Business tunables — editable from /admin/settings, never env vars (Appendix A).
create table settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Distributed token bucket for the Hostaway governor (§6.2)
create table hostaway_rate_limit (
  bucket      text primary key,
  tokens      double precision not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Advisory locks for jobs (§3.2). Keyed by hashtext so callers pass strings.
create or replace function try_advisory_lock(lock_key text) returns boolean
language sql volatile security definer as $$
  select pg_try_advisory_lock(hashtext(lock_key));
$$;
create or replace function release_advisory_lock(lock_key text) returns boolean
language sql volatile security definer as $$
  select pg_advisory_unlock(hashtext(lock_key));
$$;

-- Token bucket: returns true and consumes one token if available.
create or replace function hostaway_rate_limit_acquire(p_bucket text, p_max_tokens numeric, p_refill_per_sec numeric)
returns boolean language plpgsql volatile security definer as $$
declare
  r hostaway_rate_limit%rowtype;
  now_ts timestamptz := clock_timestamp();
  refilled double precision;
begin
  insert into hostaway_rate_limit (bucket, tokens, updated_at)
    values (p_bucket, p_max_tokens, now_ts)
    on conflict (bucket) do nothing;
  select * into r from hostaway_rate_limit h where h.bucket = p_bucket for update;
  refilled := least(p_max_tokens::double precision, r.tokens + extract(epoch from (now_ts - r.updated_at)) * p_refill_per_sec);
  if refilled >= 1 then
    update hostaway_rate_limit h set tokens = refilled - 1, updated_at = now_ts where h.bucket = p_bucket;
    return true;
  else
    update hostaway_rate_limit h set tokens = refilled, updated_at = now_ts where h.bucket = p_bucket;
    return false;
  end if;
end $$;

-- Booking reference generator: LLX-YYYY-NNNNNN
create or replace function next_booking_reference() returns text
language sql volatile as $$
  select 'LLX-' || to_char(now() at time zone 'Australia/Melbourne', 'YYYY') || '-' ||
         lpad(nextval('booking_reference_seq')::text, 6, '0');
$$;

-- Availability aggregation powering the heat map (§14.3) — one query, index-backed.
create or replace function map_availability(p_from date, p_to date)
returns table (listing_id uuid, lng double precision, lat double precision,
               available_nights int, total_nights int, median_rate_cents bigint, bedrooms smallint, suburb text)
language sql stable as $$
  select l.id,
         st_x(l.geom_public::geometry), st_y(l.geom_public::geometry),
         count(*) filter (where case when c.allotment is not null then c.allotment > 0 else c.is_available end)::int,
         (p_to - p_from)::int,
         (percentile_cont(0.5) within group (order by c.price_cents))::bigint,
         l.bedrooms, l.suburb
  from listings l
  join calendar_days c on c.listing_id = l.id and c.date >= p_from and c.date < p_to
  where l.is_active and l.is_partner_visible and l.geom_public is not null
  group by l.id, l.geom_public, l.bedrooms, l.suburb;
$$;

-- Gap-free availability search (§15.1). Fails closed on any missing night.
create or replace function search_available_listings(
  p_check_in date, p_check_out date, p_guests int default 1, p_pets int default 0
) returns setof listings language sql stable as $$
  select l.*
  from listings l
  where l.is_active and l.is_partner_visible
    and coalesce(l.max_guests, 0) >= p_guests
    and l.max_pets >= p_pets
    and not exists (
      select 1
      from generate_series(p_check_in, p_check_out - 1, interval '1 day') d(day)
      left join calendar_days c on c.listing_id = l.id and c.date = d.day::date
      where c.date is null
         or not (case when c.allotment is not null then c.allotment > 0 else c.is_available end)
    )
    and not exists (
      select 1 from inventory_holds h
      where h.listing_id = l.id and h.stay_range && daterange(p_check_in, p_check_out, '[)') and h.expires_at > now()
    )
    and not exists (
      select 1 from booking_requests b
      where b.listing_id = l.id
        and b.status in ('APPROVED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN')
        and b.stay_range && daterange(p_check_in, p_check_out, '[)')
    )
    and (p_check_out - p_check_in) >= coalesce((
          select max(c2.min_stay) from calendar_days c2
          where c2.listing_id = l.id and c2.date >= p_check_in and c2.date < p_check_out), l.min_nights, 1)
    and not exists (select 1 from calendar_days ca where ca.listing_id = l.id and ca.date = p_check_in and ca.closed_on_arrival)
    and not exists (select 1 from calendar_days cd where cd.listing_id = l.id and cd.date = p_check_out and cd.closed_on_departure);
$$;

-- updated_at maintenance
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['partner_orgs','listings','booking_requests','booking_comments','payments','invoices'] loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Custom access token hook: puts org_id and user_role into the JWT (§8.3).
-- NOTE: the claim is user_role, not role — Supabase reserves `role` for the Postgres role PostgREST assumes.
-- Enable in Supabase dashboard → Authentication → Hooks → Custom Access Token → public.custom_access_token_hook
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  claims jsonb;
  u record;
begin
  select org_id, role, status into u from public.partner_users where auth_user_id = (event->>'user_id')::uuid;
  claims := event->'claims';
  if u.org_id is not null and u.status = 'active' then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(u.org_id::text));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(u.role::text));
  else
    claims := jsonb_set(claims, '{org_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on public.partner_users to supabase_auth_admin;
-- (see policy users_select_auth_admin in the RLS section below)

-- ---------------------------------------------------------------------------
-- Row-level security — the tenancy boundary (§8.3)
-- ---------------------------------------------------------------------------
alter table partner_orgs            enable row level security;
alter table partner_users           enable row level security;
alter table invitations             enable row level security;
alter table partner_documents       enable row level security;
alter table role_permissions        enable row level security;
alter table listings                enable row level security;
alter table listing_images          enable row level security;
alter table listing_amenities       enable row level security;
alter table listing_access_details  enable row level security;
alter table calendar_days           enable row level security;
alter table rate_cards              enable row level security;
alter table quotes                  enable row level security;
alter table booking_requests        enable row level security;
alter table inventory_holds         enable row level security;
alter table booking_status_history  enable row level security;
alter table booking_comments        enable row level security;
alter table booking_documents       enable row level security;
alter table checkin_access_log      enable row level security;
alter table payments                enable row level security;
alter table invoices                enable row level security;
alter table refunds                 enable row level security;
alter table disputes                enable row level security;
alter table audit_log               enable row level security;
alter table webhook_events          enable row level security;
alter table sync_runs               enable row level security;
alter table integration_tokens      enable row level security;
alter table notifications           enable row level security;
alter table saved_searches          enable row level security;
alter table settings                enable row level security;
alter table hostaway_rate_limit     enable row level security;

-- Orgs & users
create policy org_select on partner_orgs for select using (id = public.jwt_org_id() or public.jwt_is_livluxe());
create policy org_update_admin on partner_orgs for update
  using (id = public.jwt_org_id() and public.jwt_role() in ('partner_admin','partner_finance')) with check (id = public.jwt_org_id());
create policy org_all_livluxe on partner_orgs for all using (public.jwt_is_livluxe()) with check (public.jwt_is_livluxe());

create policy users_select on partner_users for select using (org_id = public.jwt_org_id() or public.jwt_is_livluxe());
create policy users_manage_partner_admin on partner_users for all
  using (org_id = public.jwt_org_id() and public.jwt_role() = 'partner_admin')
  with check (org_id = public.jwt_org_id() and role::text like 'partner_%');
create policy users_all_livluxe_admin on partner_users for all
  using (public.jwt_role() = 'livluxe_admin') with check (public.jwt_role() = 'livluxe_admin');
-- The JWT hook runs as supabase_auth_admin and must be able to read partner_users despite RLS.
create policy users_select_auth_admin on partner_users for select to supabase_auth_admin using (true);

create policy invitations_org on invitations for all
  using ((org_id = public.jwt_org_id() and public.jwt_role() = 'partner_admin') or public.jwt_role() = 'livluxe_admin')
  with check ((org_id = public.jwt_org_id() and public.jwt_role() = 'partner_admin') or public.jwt_role() = 'livluxe_admin');

create policy docs_org on partner_documents for all
  using (org_id = public.jwt_org_id() or public.jwt_is_livluxe()) with check (org_id = public.jwt_org_id() or public.jwt_is_livluxe());

create policy role_permissions_read on role_permissions for select using (true);

-- Listings: everyone authenticated sees partner-visible active listings; Livluxe sees all.
create policy listings_select on listings for select
  using (public.jwt_is_livluxe() or (is_active and is_partner_visible));
create policy listings_write_livluxe on listings for all using (public.jwt_is_livluxe()) with check (public.jwt_is_livluxe());
create policy listing_images_select on listing_images for select using (true);
create policy listing_amenities_select on listing_amenities for select using (true);
create policy calendar_select on calendar_days for select using (true);

-- Access details: Livluxe only via RLS. Partners receive them ONLY through the
-- server-side entitlement function in a Route Handler (§8.4), never by direct select.
create policy access_details_livluxe on listing_access_details for all using (public.jwt_is_livluxe()) with check (public.jwt_is_livluxe());

-- Rate cards: partner sees its own (read), finance/admin manage.
create policy rate_cards_select on rate_cards for select using (org_id = public.jwt_org_id() or public.jwt_is_livluxe());
create policy rate_cards_manage on rate_cards for all
  using (public.jwt_role() in ('livluxe_finance','livluxe_admin')) with check (public.jwt_role() in ('livluxe_finance','livluxe_admin'));

create policy quotes_select on quotes for select using (org_id = public.jwt_org_id() or public.jwt_is_livluxe());
create policy quotes_insert on quotes for insert
  with check (org_id = public.jwt_org_id() and public.jwt_role() in ('partner_admin','partner_booker') or public.jwt_is_livluxe());

-- Booking requests (verbatim from §8.3)
create policy br_select_partner on booking_requests for select using (org_id = public.jwt_org_id() or public.jwt_is_livluxe());
create policy br_insert_partner on booking_requests for insert
  with check (org_id = public.jwt_org_id() and public.jwt_role() in ('partner_admin','partner_booker') and status in ('DRAFT','SUBMITTED'));
create policy br_update_partner on booking_requests for update
  using (org_id = public.jwt_org_id() and public.jwt_role() in ('partner_admin','partner_booker'))
  with check (status in ('DRAFT','SUBMITTED','CANCELLED'));
create policy br_all_livluxe on booking_requests for all using (public.jwt_is_livluxe()) with check (public.jwt_is_livluxe());

create policy holds_select on inventory_holds for select using (org_id = public.jwt_org_id() or public.jwt_is_livluxe());
create policy holds_livluxe on inventory_holds for all using (public.jwt_is_livluxe()) with check (public.jwt_is_livluxe());

create policy history_select on booking_status_history for select
  using (public.jwt_is_livluxe() or exists (select 1 from booking_requests b where b.id = booking_id and b.org_id = public.jwt_org_id()));

-- Internal comments are invisible to partners at the database level.
create policy bc_select on booking_comments for select
  using (public.jwt_is_livluxe()
         or (visibility = 'shared' and exists (select 1 from booking_requests b where b.id = booking_id and b.org_id = public.jwt_org_id())));
create policy bc_insert on booking_comments for insert
  with check (
    (public.jwt_is_livluxe())
    or (visibility = 'shared' and public.jwt_role() in ('partner_admin','partner_booker')
        and exists (select 1 from booking_requests b where b.id = booking_id and b.org_id = public.jwt_org_id())));

create policy bd_org on booking_documents for all
  using (public.jwt_is_livluxe() or exists (select 1 from booking_requests b where b.id = booking_id and b.org_id = public.jwt_org_id()))
  with check (public.jwt_is_livluxe() or exists (select 1 from booking_requests b where b.id = booking_id and b.org_id = public.jwt_org_id()));

create policy checkin_log_livluxe on checkin_access_log for select using (public.jwt_is_livluxe());

-- Money
create policy payments_select on payments for select
  using (public.jwt_is_livluxe() or exists (select 1 from booking_requests b where b.id = booking_id and b.org_id = public.jwt_org_id()));
create policy invoices_select on invoices for select using (org_id = public.jwt_org_id() or public.jwt_is_livluxe());
create policy refunds_select on refunds for select
  using (public.jwt_is_livluxe() or exists (select 1 from booking_requests b where b.id = booking_id and b.org_id = public.jwt_org_id()));
create policy disputes_livluxe on disputes for select using (public.jwt_is_livluxe());

-- Operational: Livluxe read; writes only via service role (which bypasses RLS).
create policy audit_select on audit_log for select
  using (public.jwt_role() in ('livluxe_finance','livluxe_admin') or (public.jwt_role() = 'livluxe_ops' and actor_id = (select id from partner_users where auth_user_id = auth.uid())));
create policy webhook_events_livluxe on webhook_events for select using (public.jwt_is_livluxe());
create policy sync_runs_livluxe on sync_runs for select using (public.jwt_is_livluxe());
-- integration_tokens and hostaway_rate_limit: no policies → service role only.
create policy notifications_own on notifications for all
  using (user_id = (select id from partner_users where auth_user_id = auth.uid()))
  with check (user_id = (select id from partner_users where auth_user_id = auth.uid()));
create policy saved_searches_own on saved_searches for all
  using (user_id = (select id from partner_users where auth_user_id = auth.uid()))
  with check (user_id = (select id from partner_users where auth_user_id = auth.uid()) and org_id = public.jwt_org_id());
create policy settings_read on settings for select using (public.jwt_is_livluxe());
create policy settings_write_admin on settings for all
  using (public.jwt_role() = 'livluxe_admin') with check (public.jwt_role() = 'livluxe_admin');

-- ---------------------------------------------------------------------------
-- Seed: permission matrix (§2.3) and default settings (Appendix A)
-- ---------------------------------------------------------------------------
insert into role_permissions (role, capability) values
  -- everyone
  ('partner_admin','listings.view'),('partner_booker','listings.view'),('partner_viewer','listings.view'),('partner_finance','listings.view'),
  ('livluxe_ops','listings.view'),('livluxe_finance','listings.view'),('livluxe_admin','listings.view'),
  ('partner_admin','rates.view_partner'),('partner_booker','rates.view_partner'),('partner_viewer','rates.view_partner'),('partner_finance','rates.view_partner'),
  ('livluxe_ops','rates.view_partner'),('livluxe_finance','rates.view_partner'),('livluxe_admin','rates.view_partner'),
  ('partner_admin','requests.view_own_org'),('partner_booker','requests.view_own_org'),('partner_viewer','requests.view_own_org'),('partner_finance','requests.view_own_org'),
  ('livluxe_ops','requests.view_own_org'),('livluxe_finance','requests.view_own_org'),('livluxe_admin','requests.view_own_org'),
  -- quotes / submit / comment
  ('partner_admin','quotes.create'),('partner_booker','quotes.create'),('livluxe_ops','quotes.create'),('livluxe_finance','quotes.create'),('livluxe_admin','quotes.create'),
  ('partner_admin','requests.submit'),('partner_booker','requests.submit'),('livluxe_ops','requests.submit'),('livluxe_finance','requests.submit'),('livluxe_admin','requests.submit'),
  ('partner_admin','requests.comment'),('partner_booker','requests.comment'),('livluxe_ops','requests.comment'),('livluxe_finance','requests.comment'),('livluxe_admin','requests.comment'),
  -- pay
  ('partner_admin','payments.authorise'),('partner_booker','payments.authorise'),('livluxe_finance','payments.authorise'),('livluxe_admin','payments.authorise'),
  -- livluxe-only
  ('livluxe_ops','requests.view_all_orgs'),('livluxe_finance','requests.view_all_orgs'),('livluxe_admin','requests.view_all_orgs'),
  ('livluxe_ops','requests.approve'),('livluxe_finance','requests.approve'),('livluxe_admin','requests.approve'),
  ('livluxe_ops','requests.counter'),('livluxe_finance','requests.counter'),('livluxe_admin','requests.counter'),
  ('livluxe_ops','checkin.release'),('livluxe_finance','checkin.release'),('livluxe_admin','checkin.release'),
  ('livluxe_ops','hostaway.resync'),('livluxe_finance','hostaway.resync'),('livluxe_admin','hostaway.resync'),
  ('livluxe_ops','audit.view_own'),('livluxe_finance','audit.view_own'),('livluxe_admin','audit.view_own'),
  -- check-in view (released)
  ('partner_admin','checkin.view_released'),('partner_booker','checkin.view_released'),('partner_viewer','checkin.view_released'),
  ('livluxe_ops','checkin.view_released'),('livluxe_finance','checkin.view_released'),('livluxe_admin','checkin.view_released'),
  -- cancel
  ('partner_admin','requests.cancel'),('partner_booker','requests.cancel'),('livluxe_ops','requests.cancel'),('livluxe_finance','requests.cancel'),('livluxe_admin','requests.cancel'),
  -- invoices
  ('partner_admin','invoices.download'),('partner_booker','invoices.download'),('partner_finance','invoices.download'),
  ('livluxe_ops','invoices.download'),('livluxe_finance','invoices.download'),('livluxe_admin','invoices.download'),
  -- finance / admin
  ('livluxe_finance','refunds.issue'),('livluxe_admin','refunds.issue'),
  ('partner_admin','org.manage_users'),('livluxe_admin','org.manage_users'),
  ('livluxe_finance','rate_cards.manage'),('livluxe_admin','rate_cards.manage'),
  ('livluxe_admin','partners.manage'),
  ('livluxe_finance','audit.view'),('livluxe_admin','audit.view'),
  ('livluxe_admin','support.impersonate');

insert into settings (key, value, description) values
  ('hold.duration_hours',            '48',    'Soft hold duration after submission'),
  ('hold.hard_above_cents',          'null',  'Auto hard-hold in Hostaway above this value (null = never)'),
  ('sla.default_hours',              '4',     'Decision SLA in business hours'),
  ('sla.tier1_hours',                '2',     'Decision SLA for tier-1 insurance partners'),
  ('sla.business_hours',             '{"start":"08:00","end":"18:00","timezone":"Australia/Melbourne"}', 'Operating hours for SLA arithmetic'),
  ('sla.escalation_pcts',            '[50,80,100,150]', 'Escalation ladder as % of SLA'),
  ('deposit.default_pct',            '20',    'Mode B deposit percentage'),
  ('cancellation.cutoff_days',       '14',    'Partner self-service cancellation cut-off'),
  ('cancellation.retention_schedule','[]',    'Retention % by days-before-check-in; set by Livluxe'),
  ('checkin.release_offset_hours',   '48',    'Release access pack at check-in minus N hours'),
  ('checkin.purge_after_days',       '7',     'Purge credentials N days post-checkout'),
  ('quote.validity_hours',           '48',    'Default quote validity'),
  ('quote.price_change_tolerance_pct','2',    'Honour expired quote if price moved less than this'),
  ('auto_approve.enabled',           'false', 'Global kill-switch for per-partner auto-approval'),
  ('authorisation.max_age_days',     '5',     'Flag uncaptured authorisations older than this'),
  ('turnover.min_hours',             '4',     'Default minimum cleaning turnover between stays'),
  ('stay.max_nights_before_manual',  '365',   'Route stays above this to manual handling'),
  ('tax.rules',                      '[{"label":"GST (10%)","minNights":1,"ratePct":10}]', 'PLACEHOLDER — accountant sign-off required (§9.1)'),
  ('hostaway.direct_channel_id',     'null',  'Channel ID for platform-created reservations (§6.7)'),
  ('hostaway.reference_custom_field_id','null','Hostaway custom field carrying the platform booking reference');
