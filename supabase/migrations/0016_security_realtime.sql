-- ============================================================
-- Doorline 0016 — cross-tenant RPC fix + realtime publication catch-up
--
-- Two things here:
--   1) SECURITY FIX. leaderboard(), rep_accountability() and office_rollup()
--      are SECURITY DEFINER (they run as the function owner, bypassing RLS)
--      and filtered ONLY by the client-supplied p_org argument. Any signed-in
--      user could pass another org's UUID and read that org's leaderboard /
--      accountability / office numbers. We now scope every row by
--      current_org_id() (derived from auth.uid()), so the p_org argument can
--      no longer be used to reach across tenants. The parameter is kept in the
--      signature for call-site compatibility but is otherwise ignored.
--   2) Realtime: add the tables the client subscribes to that were never in
--      the supabase_realtime publication (territories, profiles, and the new
--      report tables) so live updates actually deliver.
-- ============================================================

-- ---- 1) cross-tenant scoping --------------------------------------------

-- leaderboard: filter by the caller's own org, not the client's p_org.
create or replace function leaderboard(p_org uuid)
returns setof mv_leaderboard language sql stable security definer set search_path = public as
$$ select * from mv_leaderboard
   where org_id = current_org_id()
   order by revenue_cents desc, closes desc $$;

-- rep_accountability: same — caller's org, requested day.
create or replace function rep_accountability(p_org uuid, p_day date)
returns setof mv_accountability language sql stable security definer set search_path = public as
$$ select * from mv_accountability
   where org_id = current_org_id() and day = p_day $$;

-- office_rollup: same — caller's org, requested day.
create or replace function office_rollup(p_org uuid, p_day date)
returns table (rep_id uuid, full_name text, doors bigint,
               nh bigint, rl bigint, dm bigint, bid bigint, d bigint, ni bigint, nq bigint, cb bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name,
    count(s.*) as doors,
    count(*) filter (where s.nh)  as nh,
    count(*) filter (where s.rl)  as rl,
    count(*) filter (where s.dm)  as dm,
    count(*) filter (where s.bid) as bid,
    count(*) filter (where s.d)   as d,
    count(*) filter (where s.ni)  as ni,
    count(*) filter (where s.nq)  as nq,
    count(*) filter (where s.cb is not null and s.cb <> '') as cb
  from profiles p
  left join street_rows s on s.rep_id = p.id and s.day = p_day
  where p.org_id = current_org_id() and p.role = 'rep'
  group by p.id, p.full_name
$$;

-- Defense in depth: these RPCs only make sense for a signed-in member of an
-- org. An anon caller has auth.uid() = null (current_org_id() → null → no
-- rows), but lock the surface so it isn't even reachable. Postgres grants
-- EXECUTE to PUBLIC by default, and both anon and authenticated inherit that
-- PUBLIC grant — so a REVOKE FROM anon alone does nothing. Revoke from PUBLIC,
-- then grant back to authenticated only.
-- Do NOT touch current_org_id()/current_user_role() — RLS policies call them
-- as the querying role, so authenticated must keep execute on those.
revoke execute on function leaderboard(uuid)                from public;
revoke execute on function rep_accountability(uuid, date)   from public;
revoke execute on function office_rollup(uuid, date)        from public;
revoke execute on function assign_territory(uuid, uuid)     from public;
revoke execute on function record_door_activity(uuid, text) from public;
revoke execute on function set_consent(boolean)             from public;
grant execute on function leaderboard(uuid)                to authenticated;
grant execute on function rep_accountability(uuid, date)   to authenticated;
grant execute on function office_rollup(uuid, date)        to authenticated;
grant execute on function assign_territory(uuid, uuid)     to authenticated;
grant execute on function record_door_activity(uuid, text) to authenticated;
grant execute on function set_consent(boolean)             to authenticated;

-- assign_territory is SECURITY DEFINER and had no org/role check, so any
-- authenticated user could reassign any territory in any org by guessing
-- UUIDs. Gate it: caller must be a manager+ and both the territory and the
-- target rep must live in the caller's own org.
create or replace function assign_territory(territory_id uuid, rep_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare prev_rep uuid; tname text; torg uuid;
begin
  if current_user_role() not in ('owner','admin','manager') then
    raise exception 'not authorized';
  end if;
  select assigned_to, name, org_id into prev_rep, tname, torg
    from territories where id = territory_id;
  if torg is null or torg <> current_org_id() then
    raise exception 'territory not in your organization';
  end if;
  if rep_id is not null and not exists (
    select 1 from profiles where id = rep_id and org_id = current_org_id()
  ) then
    raise exception 'rep not in your organization';
  end if;
  -- clear the prior rep's label if it pointed at this territory
  if prev_rep is not null and prev_rep <> rep_id then
    update profiles set territory = '—' where id = prev_rep and territory = tname;
  end if;
  update territories set assigned_to = rep_id where id = territory_id;
  if rep_id is not null then
    update profiles set territory = tname where id = rep_id;
  end if;
end $$;

-- ---- 2) realtime publication catch-up -----------------------------------
-- add-table errors if the table is already a member, so guard each one.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'territories') then
    alter publication supabase_realtime add table territories;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table profiles;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'report_batches') then
    alter publication supabase_realtime add table report_batches;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'report_rows') then
    alter publication supabase_realtime add table report_rows;
  end if;
end $$;
