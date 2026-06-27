-- ============================================================
-- Doorline 0001 — core multi-tenant schema (Postgres + PostGIS)
-- Authoritative production schema. Run on a Supabase project with
-- the postgis extension available. Supersedes the quickstart
-- supabase/schema.sql (kept for the one-file demo path).
-- ============================================================
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---- enums --------------------------------------------------
do $$ begin
  create type user_role   as enum ('owner','admin','manager','rep','viewer');
  create type user_status as enum ('active','deactivated');
  create type plan_tier   as enum ('starter','growth','scale','free');
  create type door_status as enum ('untouched','nothome','callback','appt','notint','sold','dnc');
  create type consent_state as enum ('granted','denied');
exception when duplicate_object then null; end $$;

-- ---- organizations (tenant root) ----------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_path text,                                   -- Storage object path
  plan plan_tier not null default 'growth',
  stripe_customer_id text, stripe_subscription_id text, stripe_item_id text,
  created_at timestamptz not null default now()
);

-- ---- profiles (1:1 auth.users) ------------------------------
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

-- ---- territories (scheduling + drawn/ZIP boundary) ----------
create table territories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  color text default '#2e90fa',
  assigned_to uuid references profiles(id) on delete set null,
  boundary geography(Polygon,4326),                 -- drawn or ZIP-derived
  start_on date, end_on date,
  notes text,
  created_at timestamptz not null default now()
);
create index on territories (org_id);
create index on territories using gist (boundary);

-- ---- homes / doors ------------------------------------------
create table homes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references profiles(id) on delete set null,
  addr text,
  lat double precision not null,
  lng double precision not null,
  geom geography(Point,4326)
    generated always as (st_setsrid(st_makepoint(lng, lat),4326)::geography) stored,
  status door_status not null default 'untouched',
  contact text, phone text, notes text,
  due date,
  activity jsonb not null default '[]'::jsonb,       -- denormalized funnel for fast reads
  updated_at timestamptz not null default now()
);
create index on homes (org_id);
create index on homes (rep_id);
create index on homes using gist (geom);

-- ---- door activity funnel (append-only source of truth) -----
create table door_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  rep_id uuid references profiles(id) on delete set null,
  type text not null,                                -- knocked | contact | pitch | followup
  created_at timestamptz not null default now()
);
create index on door_activity (home_id);
create index on door_activity (org_id, created_at desc);

-- ---- deals --------------------------------------------------
create table deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid references profiles(id) on delete set null,
  home_id uuid references homes(id) on delete set null,
  customer text, product text, value_cents integer default 0,
  created_at timestamptz not null default now()
);
create index on deals (org_id);

-- ---- bulletin board -----------------------------------------
create table posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  title text not null,
  body text,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index on posts (org_id, created_at desc);

-- ---- consent (legal gate) + audit ---------------------------
create table consents (
  rep_id uuid primary key references profiles(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  state consent_state not null default 'denied',
  updated_at timestamptz not null default now()
);
create table consent_audit (
  id bigint generated always as identity primary key,
  rep_id uuid not null, org_id uuid not null,
  state consent_state not null, at timestamptz not null default now()
);

-- ---- locations firehose (partitioned by month) --------------
create table locations (
  id bigint generated always as identity,
  org_id uuid not null,
  rep_id uuid not null,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now(),
  primary key (id, recorded_at)
) partition by range (recorded_at);

-- Initial partitions (production: automate with pg_partman or the cron in 0004).
create table locations_2026_06 partition of locations
  for values from ('2026-06-01') to ('2026-07-01');
create table locations_2026_07 partition of locations
  for values from ('2026-07-01') to ('2026-08-01');
create table locations_default partition of locations default;
-- BRIN is ideal for append-only, time-ordered data (tiny, fast range scans).
create index on locations using brin (recorded_at);
create index on locations (rep_id, recorded_at desc);

-- ---- downsampled per-rep daily route (cheap to read) --------
create table location_tracks (
  org_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  path geography(LineString,4326),
  point_count integer not null default 0,
  minutes_on integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (rep_id, day)
);
create index on location_tracks (org_id, day);

-- ---- geocode cache (don't re-pay the geocoder) --------------
create table geocode_cache (
  query_hash text primary key,                       -- sha256(lower(query))
  query text not null,
  lat double precision, lng double precision,
  raw jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days'
);
