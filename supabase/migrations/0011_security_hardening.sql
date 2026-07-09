-- ============================================================
-- Doorline 0011 — close tenant-isolation gaps found by the security advisor
-- ============================================================

-- consent_audit had no RLS at all -- any authenticated user could read/write
-- every org's consent history via PostgREST. Reads limited to the org's own
-- managers+; writes only happen through set_consent() (SECURITY DEFINER),
-- so no insert policy is needed for direct client access.
alter table consent_audit enable row level security;
create policy consent_audit_read on consent_audit for select
  using (org_id = current_org_id() and current_user_role() in ('owner','admin','manager'));

-- locations_* partitions had no RLS of their own -- Postgres does not apply
-- a partitioned parent's RLS policies to direct queries against a named
-- partition. Enabling RLS with no policy here forces all reads through the
-- parent `locations` table (which already has the correct policy); writes
-- already go through the service-role edge function, bypassing RLS anyway.
alter table locations_2026_06 enable row level security;
alter table locations_2026_07 enable row level security;
alter table locations_default enable row level security;

-- geocode_cache: shared, non-tenant cache of public geocoding lookups --
-- nothing sensitive, but nothing was gating it either. Safe read-only access.
alter table geocode_cache enable row level security;
create policy geocode_cache_read on geocode_cache for select using (true);

-- spatial_ref_sys is owned by the postgis extension itself (not this role),
-- so RLS can't be toggled on it here. It's PostGIS's own static SRID
-- reference table, not application data -- Supabase's advisor flags it on
-- every PostGIS install; there's nothing tenant-sensitive in it.

-- mv_leaderboard / mv_accountability: materialized views can't carry RLS
-- policies, and PostgREST auto-exposes any view it can see -- so without
-- this, any signed-in user could query /rest/v1/mv_leaderboard directly and
-- see every org's numbers, bypassing the org-scoped leaderboard()/
-- rep_accountability() RPCs entirely. Revoke direct access; the RPCs (which
-- run SECURITY DEFINER) still work since they query the view as their owner.
revoke select on mv_leaderboard from anon, authenticated;
revoke select on mv_accountability from anon, authenticated;
