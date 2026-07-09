-- ============================================================
-- Doorline 0008 — "Not Qualified" disposition on the Street Sheet
-- ============================================================
alter table street_rows
  add column if not exists nq boolean not null default false; -- not qualified

-- Column set changed (added nq), and Postgres won't let CREATE OR REPLACE
-- change a function's OUT-parameter row type -- drop it first.
drop function if exists office_rollup(uuid, date);

create function office_rollup(p_org uuid, p_day date)
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
  where p.org_id = p_org and p.role = 'rep'
  group by p.id, p.full_name
$$;
