-- ============================================================
-- Doorline 0019 — homeowner identity, "served" state, and route planning
--
-- Three additive capabilities. Nothing here alters or drops an existing
-- column, policy, or row, so applying it cannot change current behaviour:
--
--   1. homes.owner_name  — who OWNS the house, as opposed to homes.contact
--      which is "who you spoke to" and only gets filled in after a knock.
--      Populated ahead of the knock by a parcel import, so a rep walks up
--      already knowing the name.
--
--   2. homes.serviced    — this address is already a customer of ours.
--      Distinct from status='sold' (which means THIS rep closed it on THIS
--      pass); serviced survives re-loops and marks "don't pitch, they're
--      already on the books".
--
--   3. routes / route_stops — an ordered walk list. Territories say WHERE a
--      rep works; a route says in WHAT ORDER, one numbered stop at a time.
--
-- Client compatibility: the app writes owner_name/serviced only when they
-- hold a value, and reads routes through a best-effort loader that returns
-- empty on error (same pattern as report_batches). So a client running
-- ahead of this migration keeps working, and a database running ahead of
-- the client is simply unused. Neither half can break the other.
-- ============================================================

-- ---- 1 + 2: homeowner name and serviced flag -----------------
alter table homes add column if not exists owner_name text;
alter table homes add column if not exists serviced boolean not null default false;

create index if not exists homes_serviced_idx on homes (org_id, serviced) where serviced;

-- ---- 3: routes ------------------------------------------------
create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references profiles(id) on delete set null,
  name text not null default 'Route',
  day date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists routes_org_day_idx on routes (org_id, day);
create index if not exists routes_rep_day_idx on routes (rep_id, day);

create table if not exists route_stops (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  route_id uuid not null references routes(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  seq integer not null default 0,
  done boolean not null default false,
  -- A door appears at most once in a given route; re-adding it just moves it.
  unique (route_id, home_id)
);
create index if not exists route_stops_route_seq_idx on route_stops (route_id, seq);

-- ---- RLS: mirrors street_rows (own rows, or any row for a manager) ----
alter table routes enable row level security;
alter table route_stops enable row level security;

drop policy if exists routes_read on routes;
create policy routes_read on routes for select
  using (org_id = current_org_id()
         and (rep_id = auth.uid() or current_user_role() in ('owner','admin','manager')));

drop policy if exists routes_write on routes;
create policy routes_write on routes for all
  using (org_id = current_org_id()
         and (rep_id = auth.uid() or current_user_role() in ('owner','admin','manager')))
  with check (org_id = current_org_id());

-- Stops inherit their route's visibility: you may touch a stop only if the
-- parent route is one you could read in the first place.
drop policy if exists route_stops_read on route_stops;
create policy route_stops_read on route_stops for select
  using (org_id = current_org_id()
         and exists (select 1 from routes r
                     where r.id = route_id
                       and r.org_id = current_org_id()
                       and (r.rep_id = auth.uid() or current_user_role() in ('owner','admin','manager'))));

drop policy if exists route_stops_write on route_stops;
create policy route_stops_write on route_stops for all
  using (org_id = current_org_id()
         and exists (select 1 from routes r
                     where r.id = route_id
                       and r.org_id = current_org_id()
                       and (r.rep_id = auth.uid() or current_user_role() in ('owner','admin','manager'))))
  with check (org_id = current_org_id());

-- ---- realtime (guarded: re-running must not error) ------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'routes') then
    alter publication supabase_realtime add table routes;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'route_stops') then
    alter publication supabase_realtime add table route_stops;
  end if;
end $$;
