-- Allow the custom access token hook (running as supabase_auth_admin) to read partner_users.
create policy users_select_auth_admin on partner_users for select to supabase_auth_admin using (true);
