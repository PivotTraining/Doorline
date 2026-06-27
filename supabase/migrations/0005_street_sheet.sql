-- ============================================================
-- Doorline 0005 — digital Street Sheet (the TTS paper form)
-- One row per worked door; columns mirror the paper key.
-- ============================================================
create table street_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  rep_id uuid not null references profiles(id) on delete cascade,
  day date not null default current_date,
  street text,
  nh boolean not null default false,   -- not home
  rl boolean not null default false,   -- reloop
  dm boolean not null default false,   -- decision maker
  bid boolean not null default false,  -- bill or id
  d boolean not null default false,    -- deal
  ni boolean not null default false,   -- not interested
  customer text, comments text, cb text,
  created_at timestamptz not null default now()
);
create index on street_rows (org_id, day);
create index on street_rows (rep_id, day);

alter table street_rows enable row level security;
create policy street_read on street_rows for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')));
create policy street_write on street_rows for all
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_role() in ('owner','admin','manager')))
  with check (org_id = current_org_id());

alter publication supabase_realtime add table street_rows;

-- Office rollup: per-rep + org tallies for a day (manager dashboard).
create or replace function office_rollup(p_org uuid, p_day date)
returns table (rep_id uuid, full_name text, doors bigint,
               nh bigint, rl bigint, dm bigint, bid bigint, d bigint, ni bigint, cb bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name,
    count(s.*) as doors,
    count(*) filter (where s.nh)  as nh,
    count(*) filter (where s.rl)  as rl,
    count(*) filter (where s.dm)  as dm,
    count(*) filter (where s.bid) as bid,
    count(*) filter (where s.d)   as d,
    count(*) filter (where s.ni)  as ni,
    count(*) filter (where s.cb is not null and s.cb <> '') as cb
  from profiles p
  left join street_rows s on s.rep_id = p.id and s.day = p_day
  where p.org_id = p_org and p.role = 'rep'
  group by p.id, p.full_name
$$;
