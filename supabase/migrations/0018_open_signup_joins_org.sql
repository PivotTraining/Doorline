-- ============================================================
-- Doorline 0018 — self-signup joins the existing org instead of creating one
--
-- Until now every self-serve signup provisioned a BRAND-NEW organization and
-- made that person its owner (0010/0013). For a single-company deployment
-- that is wrong in both directions: a new rep who signs up lands alone in an
-- empty "My Company" (exactly how a rep got stranded and invisible to their
-- manager), and they arrive holding owner privileges over it.
--
-- This makes signup join the existing organization as an ordinary rep.
--
-- !! DELIBERATE ACCESS TRADE-OFF !!
-- With this applied, ANYONE who can reach the app's signup form and create an
-- account is inside the org and can read its data under the normal rep RLS
-- policies (their own rows, plus org-wide reads like the bulletin, campaigns
-- and leaderboard). There is no invite code or email-domain check gating it.
-- That is the intended behaviour for a private team app that is not publicly
-- advertised -- it is NOT safe if the URL is discoverable by strangers.
-- To close it later, turn off "Allow new users to sign up" in Supabase Auth,
-- or replace the org lookup below with a join-code check.
--
-- Safety properties kept:
--   * New signups get role 'rep' -- never 'owner'/'admin'. Elevation stays a
--     deliberate act by an existing admin on the Personnel page.
--   * The admin-invite path (doorline_invited) is untouched: the
--     create-team-member edge function still provisions those profiles with
--     their intended org + role.
--   * If no organization exists yet (fresh install), the old bootstrap
--     behaviour still runs so the very first user can create the company.
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_org_id uuid;
begin
  -- Admin-invited member: the edge function creates the profile itself.
  if (new.raw_user_meta_data ? 'doorline_invited') then
    return new;
  end if;

  -- Join the established organization (the earliest one created). Using the
  -- oldest org rather than an arbitrary pick keeps this deterministic even if
  -- stray orgs were created before this migration.
  select id into target_org_id from organizations order by created_at limit 1;

  if target_org_id is null then
    -- Fresh install: no org exists yet, so this first user bootstraps it and
    -- is legitimately its owner.
    insert into organizations (name)
      values (coalesce(new.raw_user_meta_data->>'org_name', 'My Company'))
      returning id into target_org_id;
    insert into profiles (id, org_id, full_name, email, role)
      values (new.id, target_org_id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'owner');
    return new;
  end if;

  -- Everyone after that joins as a rep.
  insert into profiles (id, org_id, full_name, email, role)
    values (new.id, target_org_id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'rep');
  return new;
end;
$$;
