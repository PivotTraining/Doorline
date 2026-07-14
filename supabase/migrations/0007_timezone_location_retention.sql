-- ============================================================
-- Doorline 0007 — per-user timezone + home location, 90-day retention
-- ============================================================
alter table profiles
  add column if not exists timezone text,
  add column if not exists home_zip text,
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision;

alter table organizations
  add column if not exists home_zip text,
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision;

-- 90-day retention: each rep's Street Sheet history stays reviewable/
-- downloadable for 90 days IN THEIR OWN TIMEZONE (falls back to UTC for
-- a rep with no timezone set), then ages out automatically.
create or replace function purge_old_street_rows()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from street_rows s
  using profiles p
  where s.rep_id = p.id
    and s.day < ((now() at time zone coalesce(p.timezone, 'UTC'))::date - 90);
end $$;

select cron.schedule('purge-street-rows', '11 4 * * *', $$ select purge_old_street_rows() $$);
