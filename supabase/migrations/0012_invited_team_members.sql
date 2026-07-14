-- ============================================================
-- Doorline 0012 — let admins add team members to their existing org
-- The 0010 trigger provisioned a brand-new org for EVERY new auth user,
-- which is right for self-serve signup but wrong when an owner/admin adds
-- a rep (that rep must join the admin's existing org, not spawn their own).
-- The create-team-member edge function (service role) sets a
-- `doorline_invited` flag in app_metadata — which the browser CANNOT set
-- during a normal signUp(), so it can't be forged to break into another
-- org — and inserts the profile itself. This trigger just steps aside when
-- that flag is present.
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_org_id uuid;
begin
  -- Admin-invited team member: the edge function creates the profile with
  -- the correct org_id + role. Do not auto-provision a new org.
  if (new.raw_app_meta_data ? 'doorline_invited') then
    return new;
  end if;

  -- Self-serve signup: provision a fresh org + owner profile.
  insert into organizations (name)
    values (coalesce(new.raw_user_meta_data->>'org_name', 'My Company'))
    returning id into new_org_id;
  insert into profiles (id, org_id, full_name, email, role)
    values (new.id, new_org_id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'owner');
  return new;
end;
$$;
