-- ============================================================
-- Doorline — Supabase schema (app edition)
-- Adds homes (doors) and deals to the core model. Run in the
-- Supabase SQL editor. Requires the postgis extension.
-- ============================================================
create extension if not exists postgis;

create type user_role   as enum ('owner','admin','manager','rep','viewer');
create type user_status as enum ('active','deactivated');
create type plan_tier   as enum ('starter','growth','scale');
create type door_status as enum ('untouched','nothome','callback','appt','notint','sold','dnc');

-- organizations -------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan plan_tier not null default 'growth',
  stripe_customer_id text, stripe_subscription_id text, stripe_item_id text,
  created_at timestamptz not null default now()
);

-- profiles ------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  role user_role not null default 'rep',
  status user_status not null default 'active',
  manager_id uuid references profiles(id),
  territory text default '—',
  seat_price_cents integer not null default 5900,
  created_at timestamptz not null default now()
);
create index on profiles (org_id);

-- territories (geofences, optional polygon) ---------------------
create table territories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  boundary geography(Polygon,4326),
  assigned_to uuid references profiles(id),
  color text default '#4338ca',
  created_at timestamptz not null default now()
);

-- homes / doors -------------------------------------------------
create table homes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references profiles(id),
  address text,
  lat double precision not null,
  lng double precision not null,
  status door_status not null default 'untouched',
  contact text, phone text, notes text,
  due timestamptz,
  updated_at timestamptz not null default now()
);
create index on homes (org_id);
create index on homes (rep_id);

-- deals ---------------------------------------------------------
create table deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references profiles(id),
  home_id uuid references homes(id),
  customer text, product text, value_cents integer default 0,
  created_at timestamptz not null default now()
);
create index on deals (org_id);

-- live locations (GPS firehose) ---------------------------------
create table locations (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references profiles(id) on delete cascade,
  lat double precision not null, lng double precision not null,
  recorded_at timestamptz not null default now()
);
create index on locations (rep_id, recorded_at desc);

-- RLS helpers ---------------------------------------------------
create or replace function current_org_id() returns uuid
language sql stable security definer as $$ select org_id from profiles where id = auth.uid() $$;
create or replace function current_role() returns user_role
language sql stable security definer as $$ select role from profiles where id = auth.uid() $$;

-- Row-Level Security -------------------------------------------
alter table organizations enable row level security;
alter table profiles      enable row level security;
alter table territories   enable row level security;
alter table homes         enable row level security;
alter table deals         enable row level security;
alter table locations     enable row level security;

create policy org_read on organizations for select using (id = current_org_id());
create policy prof_read on profiles for select using (org_id = current_org_id());
create policy prof_write on profiles for all
  using (org_id = current_org_id() and current_role() in ('owner','admin'))
  with check (org_id = current_org_id() and current_role() in ('owner','admin'));
create policy terr_all on territories for all
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- homes: reps manage their own; managers/admins see whole org
create policy homes_read on homes for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));
create policy homes_write on homes for all
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')))
  with check (org_id = current_org_id());

create policy deals_read on deals for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));
create policy deals_write on deals for insert
  with check (org_id = current_org_id() and rep_id = auth.uid());

create policy loc_insert on locations for insert
  with check (org_id = current_org_id() and rep_id = auth.uid());
create policy loc_read on locations for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));

-- Realtime ------------------------------------------------------
alter publication supabase_realtime add table homes;
alter publication supabase_realtime add table deals;
alter publication supabase_realtime add table locations;
