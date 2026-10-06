-- =============================================================================
-- Phase 0 — authentication hardening (spec §8.1, §8.2)
--   1. Login attempt log + sliding-window rate limit (5 / account / 15 min, 20 / IP / 15 min)
--   2. Invitation preview (anonymous, token-hash keyed) and atomic acceptance
--
-- Forward-only. Apply to the hosted project via the SQL editor (see docs/HANDOFF.md).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auth attempt rate limiting (§8.2)
--    Vercel functions are stateless, so the window lives in Postgres. Keys are
--    opaque strings built by the app, e.g. "login:account:<email>" or "login:ip:<ip>".
--    No RLS policies → service role only. The function is also revoked from
--    anon/authenticated so it cannot be called through PostgREST with a user JWT.
-- ---------------------------------------------------------------------------
create table if not exists auth_attempts (
  id           bigserial primary key,
  key          text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists auth_attempts_key_time on auth_attempts (key, attempted_at desc);
alter table auth_attempts enable row level security;

-- Records an attempt and returns TRUE when the caller is still within the limit,
-- FALSE when this attempt exceeds p_max within the trailing p_window_seconds.
-- The attempt is recorded even when refused, so hammering extends the lock-out.
create or replace function public.auth_rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(secs => p_window_seconds);
  recent int;
begin
  -- Opportunistic cleanup of this key's stale rows (keeps the table tiny without a cron).
  delete from auth_attempts where key = p_key and attempted_at < since;
  insert into auth_attempts (key) values (p_key);
  select count(*) into recent from auth_attempts where key = p_key and attempted_at >= since;
  return recent <= p_max;
end $$;
revoke execute on function public.auth_rate_limit_hit(text, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Invitations (§8.1 — invite-only; token is hashed at rest, 7-day TTL)
-- ---------------------------------------------------------------------------

-- Anonymous preview for /invite/[token]: reveals only what the invitee needs to
-- decide whether to proceed. Keyed by the SHA-256 of the URL token, never the id,
-- so the table cannot be enumerated. Callable by anon through PostgREST.
create or replace function public.invitation_preview(p_token_hash text)
returns table (email text, role text, org_name text, expires_at timestamptz, accepted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.email::text, i.role::text, o.name, i.expires_at, i.accepted_at
  from invitations i
  join partner_orgs o on o.id = i.org_id
  where i.token_hash = p_token_hash
  limit 1;
$$;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- Atomic acceptance: validates the token, creates the partner_users row as ACTIVE
-- and stamps the invitation. The auth.users row must already exist (created by the
-- service role in the accept-invite route). Service role only.
create or replace function public.accept_invitation(p_token_hash text, p_auth_user_id uuid, p_full_name text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  inv invitations%rowtype;
  new_user_id uuid;
begin
  select * into inv from invitations where token_hash = p_token_hash for update;
  if inv.id is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then
    raise exception 'INVITATION_ALREADY_ACCEPTED' using errcode = 'P0003';
  end if;
  if inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0004';
  end if;

  insert into partner_users (auth_user_id, org_id, role, email, full_name, status, invited_by, invited_at, accepted_at)
  values (p_auth_user_id, inv.org_id, inv.role, inv.email, nullif(trim(p_full_name), ''), 'active', inv.invited_by, inv.created_at, now())
  returning id into new_user_id;

  update invitations set accepted_at = now() where id = inv.id;
  return new_user_id;
end $$;
revoke execute on function public.accept_invitation(text, uuid, text) from public, anon, authenticated;

-- Invitations should not be issued twice for the same address while one is open.
create unique index if not exists invitations_open_email
  on invitations (org_id, email) where accepted_at is null;
