-- ============================================================
-- Doorline 0002 — Row-Level Security (tenant isolation in the DB)
-- Every domain row is scoped to the caller's org; writes are
-- gated by role. The app never sees another tenant's data.
-- ============================================================

create or replace function current_org_id() returns uuid
language sql stable security definer set search_path = public as
$$ select org_id from profiles where id = auth.uid() $$;

create or replace function current_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

alter table organizations enable row level security;
alter table profiles      enable row level security;
alter table territories   enable row level security;
alter table homes         enable row level security;
alter table door_activity enable row level security;
alter table deals         enable row level security;
alter table posts         enable row level security;
alter table consents      enable row level security;
alter table location_tracks enable row level security;
alter table locations     enable row level security;

-- organizations: read own; owners update branding
create policy org_read   on organizations for select using (id = current_org_id());
create policy org_write  on organizations for update
  using (id = current_org_id() and current_role() in ('owner','admin'))
  with check (id = current_org_id());

-- profiles: read org; admins/owners manage
create policy prof_read  on profiles for select using (org_id = current_org_id());
create policy prof_write on profiles for all
  using (org_id = current_org_id() and current_role() in ('owner','admin'))
  with check (org_id = current_org_id() and current_role() in ('owner','admin'));

-- territories: managers/admins manage; whole org can read
create policy terr_read  on territories for select using (org_id = current_org_id());
create policy terr_write on territories for all
  using (org_id = current_org_id() and current_role() in ('owner','admin','manager'))
  with check (org_id = current_org_id() and current_role() in ('owner','admin','manager'));

-- homes: reps own theirs; managers+ see the org
create policy homes_read on homes for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));
create policy homes_write on homes for all
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')))
  with check (org_id = current_org_id());

-- door activity: rep appends own; managers+ read org
create policy act_read on door_activity for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));
create policy act_insert on door_activity for insert
  with check (org_id = current_org_id() and rep_id = auth.uid());

-- deals
create policy deals_read on deals for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));
create policy deals_insert on deals for insert
  with check (org_id = current_org_id() and rep_id = auth.uid());

-- posts: everyone reads; managers/admins write
create policy posts_read on posts for select using (org_id = current_org_id());
create policy posts_write on posts for all
  using (org_id = current_org_id() and current_role() in ('owner','admin','manager'))
  with check (org_id = current_org_id() and current_role() in ('owner','admin','manager'));

-- consent: a rep manages only their own
create policy consent_rw on consents for all
  using (org_id = current_org_id() and rep_id = auth.uid())
  with check (org_id = current_org_id() and rep_id = auth.uid());

-- location_tracks: rep reads own; managers+ read org (system writes via service role)
create policy tracks_read on location_tracks for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));

-- raw locations: managers+ read org, rep reads own; inserts go through the
-- edge function (service role, bypasses RLS) so there is no client insert policy.
create policy loc_read on locations for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));
