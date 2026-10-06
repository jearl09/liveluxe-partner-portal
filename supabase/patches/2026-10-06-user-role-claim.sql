-- Patch for databases that received the initial migration before the role -> user_role claim rename.
-- Safe to re-run.

create or replace function public.jwt_role() returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::json->>'user_role' $$;

create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable as $$
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
