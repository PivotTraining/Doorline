-- ============================================================
-- Doorline 0003 — RPCs, materialized views, downsampling
-- Keeps analytics and transactional ops off the request path.
-- ============================================================

-- ---- assign_territory: move assignment + sync rep.territory ---
create or replace function assign_territory(territory_id uuid, rep_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare prev_rep uuid; tname text;
begin
  select assigned_to, name into prev_rep, tname from territories where id = territory_id;
  -- clear the prior rep's label if it pointed at this territory
  if prev_rep is not null and prev_rep <> rep_id then
    update profiles set territory = '—' where id = prev_rep and territory = tname;
  end if;
  update territories set assigned_to = rep_id where id = territory_id;
  if rep_id is not null then
    update profiles set territory = tname where id = rep_id;
  end if;
end $$;

-- ---- record_door_activity: append + keep homes.activity hot ---
create or replace function record_door_activity(home_id uuid, atype text)
returns void language plpgsql security definer set search_path = public as $$
declare o uuid; r uuid;
begin
  select org_id into o from homes where id = home_id;
  r := auth.uid();
  insert into door_activity (org_id, home_id, rep_id, type) values (o, home_id, r, atype);
  update homes
     set activity = activity || jsonb_build_object('type', atype, 'ts', extract(epoch from now())*1000),
         updated_at = now()
   where id = home_id;
end $$;

-- ---- set_consent: write state + audit atomically -------------
create or replace function set_consent(granted boolean)
returns void language plpgsql security definer set search_path = public as $$
declare o uuid; st consent_state;
begin
  select org_id into o from profiles where id = auth.uid();
  st := case when granted then 'granted' else 'denied' end;
  insert into consents (rep_id, org_id, state, updated_at) values (auth.uid(), o, st, now())
    on conflict (rep_id) do update set state = excluded.state, updated_at = now();
  insert into consent_audit (rep_id, org_id, state) values (auth.uid(), o, st);
end $$;

-- ---- materialized views: leaderboard + accountability --------
create materialized view mv_leaderboard as
select
  p.org_id, p.id as rep_id, p.full_name,
  count(*) filter (where h.status <> 'untouched')                         as doors,
  count(*) filter (where h.status in ('callback','appt','notint','sold','dnc')) as contacts,
  count(*) filter (where h.status = 'appt')                               as appts,
  count(*) filter (where h.status = 'sold')                               as closes,
  coalesce(sum(d.value_cents),0)                                          as revenue_cents
from profiles p
left join homes h on h.rep_id = p.id
left join deals d on d.rep_id = p.id
where p.role = 'rep'
group by p.org_id, p.id, p.full_name;
create unique index on mv_leaderboard (rep_id);

create materialized view mv_accountability as
select
  t.org_id, t.rep_id, t.day,
  t.minutes_on, t.point_count,
  (select count(*) from homes h
     where h.rep_id = t.rep_id and (h.status <> 'untouched' or jsonb_array_length(h.activity) > 0)) as doors_worked
from location_tracks t;
create unique index on mv_accountability (rep_id, day);

-- read RPCs (cacheable, never scan many tables at request time)
create or replace function leaderboard(p_org uuid)
returns setof mv_leaderboard language sql stable security definer set search_path = public as
$$ select * from mv_leaderboard where org_id = p_org order by revenue_cents desc, closes desc $$;

create or replace function rep_accountability(p_org uuid, p_day date)
returns setof mv_accountability language sql stable security definer set search_path = public as
$$ select * from mv_accountability where org_id = p_org and day = p_day $$;

-- ---- downsample raw locations → daily simplified path --------
-- Run on a schedule (0004). Douglas–Peucker keeps the path cheap to draw.
create or replace function downsample_tracks(p_day date default current_date)
returns void language sql security definer set search_path = public as $$
  insert into location_tracks (org_id, rep_id, day, path, point_count, minutes_on, updated_at)
  select
    l.org_id, l.rep_id, p_day,
    st_simplify(st_makeline(st_setsrid(st_makepoint(l.lng, l.lat),4326) order by l.recorded_at), 0.00005)::geography,
    count(*),
    greatest(0, round(extract(epoch from (max(l.recorded_at) - min(l.recorded_at)))/60))::int,
    now()
  from locations l
  where l.recorded_at >= p_day and l.recorded_at < p_day + 1
  group by l.org_id, l.rep_id
  on conflict (rep_id, day) do update
    set path = excluded.path, point_count = excluded.point_count,
        minutes_on = excluded.minutes_on, updated_at = now();
$$;

create or replace function refresh_analytics()
returns void language sql security definer set search_path = public as $$
  refresh materialized view concurrently mv_leaderboard;
  refresh materialized view concurrently mv_accountability;
$$;
