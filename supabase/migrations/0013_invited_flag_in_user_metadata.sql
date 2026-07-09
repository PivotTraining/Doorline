-- ============================================================
-- Doorline 0013 — reliable invited-member detection
-- 0012 keyed off app_metadata, but GoTrue populates app_metadata in a
-- step AFTER the initial auth.users INSERT, so this AFTER-INSERT trigger
-- raced ahead and never saw the flag (spawning a duplicate org+profile).
-- user_metadata IS set atomically in the INSERT, so we key off it instead.
-- Safe: the invited path only makes the trigger STEP ASIDE — the real
-- org/role assignment happens in the create-team-member edge function from
-- the trusted server side, so a forged flag can only leave the forger with
-- a profile-less account (self-harm), never join another org.
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if (new.raw_user_meta_data ? 'doorline_invited') then
    return new; -- edge function provisions this profile
  end if;

  insert into organizations (name)
    values (coalesce(new.raw_user_meta_data->>'org_name', 'My Company'))
    returning id into new_org_id;
  insert into profiles (id, org_id, full_name, email, role)
    values (new.id, new_org_id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'owner');
  return new;
end;
$$;
