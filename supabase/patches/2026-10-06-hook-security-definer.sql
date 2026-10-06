-- Make the JWT hook security definer so it can read partner_users regardless of RLS. Safe to re-run.

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

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
