-- ============================================================
-- Doorline 0010 — self-serve signup
-- There was no way for a brand-new org to bootstrap itself: profiles/
-- organizations RLS requires the caller to ALREADY be an owner/admin of
-- the org they're writing to, which a first-time signup can't satisfy.
-- This trigger runs with elevated privilege right after a new Supabase
-- Auth user is created and provisions their organization + owner profile
-- atomically, using metadata passed from the client's signUp() call.
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into organizations (name)
    values (coalesce(new.raw_user_meta_data->>'org_name', 'My Company'))
    returning id into new_org_id;
  insert into profiles (id, org_id, full_name, email, role)
    values (new.id, new_org_id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
