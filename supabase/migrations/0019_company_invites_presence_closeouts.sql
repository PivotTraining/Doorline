-- Doorline 0019: company-bound invitations, real agent presence, durable closeouts.
-- Depends on 0001-0018. Do not turn on live signup until this migration is applied.

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses between 1 and 200),
  used_count integer not null default 0 check (used_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists company_invites_org_idx on public.company_invites(org_id);
alter table public.company_invites enable row level security;
-- Invitations are accessed only through narrowly checked SECURITY DEFINER RPCs.
revoke all on public.company_invites from anon, authenticated;

create or replace function public.create_company_invite(p_max_uses integer default 25, p_expires_days integer default 14)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_org uuid; v_token text;
begin
  v_org := public.current_org_id();
  if auth.uid() is null or v_org is null or public.current_user_role() not in ('owner', 'admin') then
    raise exception 'Only a company owner or admin can issue enrollment links.';
  end if;
  if p_max_uses not between 1 and 200 or p_expires_days not between 1 and 30 then
    raise exception 'Invalid invitation limit or expiration.';
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.company_invites(org_id, token_hash, created_by, expires_at, max_uses)
    values (v_org, encode(sha256(decode(v_token, 'hex')), 'hex'), auth.uid(),
            now() + make_interval(days => p_expires_days), p_max_uses);
  return v_token;
end $$;
revoke all on function public.create_company_invite(integer, integer) from public, anon;
grant execute on function public.create_company_invite(integer, integer) to authenticated;

create or replace function public.invited_company_name(p_token text)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]+$' then return null; end if;
  select o.name into v_name
    from public.company_invites i join public.organizations o on o.id = i.org_id
    where i.token_hash = encode(sha256(decode(p_token, 'hex')), 'hex')
      and i.expires_at > now() and i.used_count < i.max_uses;
  return v_name;
end $$;
revoke all on function public.invited_company_name(text) from public;
grant execute on function public.invited_company_name(text) to anon, authenticated;

-- Replace 0018's unsafe "all signups join oldest company" rule.
-- Only trusted service-role-created accounts may bypass a company invitation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_invite uuid; v_token text;
begin
  if coalesce((new.raw_app_meta_data->>'doorline_invited')::boolean, false) then
    return new;
  end if;
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then
    insert into public.organizations(name)
      values (coalesce(nullif(new.raw_user_meta_data->>'org_name', ''), 'My Company'))
      returning id into v_org;
    insert into public.profiles(id,org_id,full_name,email,role)
      values (new.id,v_org,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),new.email),new.email,'owner');
    return new;
  end if;
  v_token := nullif(new.raw_user_meta_data->>'doorline_invite', '');
  if v_token is null then raise exception 'A company enrollment link is required.'; end if;
  select id, org_id into v_invite, v_org from public.company_invites
    where token_hash = encode(sha256(decode(v_token, 'hex')), 'hex')
      and expires_at > now() and used_count < max_uses
    for update;
  if v_invite is null then raise exception 'Company enrollment link expired or invalid.'; end if;
  update public.company_invites set used_count = used_count + 1 where id = v_invite;
  insert into public.profiles(id,org_id,full_name,email,role)
    values (new.id,v_org,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),new.email),new.email,'rep');
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create table if not exists public.agent_presence (
  rep_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  online boolean not null default false,
  lat double precision,
  lng double precision,
  started_at timestamptz,
  last_seen timestamptz not null default now(),
  check (lat is null or lat between -90 and 90),
  check (lng is null or lng between -180 and 180)
);
create index if not exists agent_presence_org_idx on public.agent_presence(org_id, last_seen desc);
alter table public.agent_presence enable row level security;
create policy agent_presence_select on public.agent_presence for select to authenticated
  using (org_id = public.current_org_id()
         and (rep_id = (select auth.uid()) or public.current_user_role() in ('owner','admin','manager')));
create policy agent_presence_insert on public.agent_presence for insert to authenticated
  with check (org_id = public.current_org_id() and rep_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role = 'rep'));
create policy agent_presence_update on public.agent_presence for update to authenticated
  using (org_id = public.current_org_id() and rep_id = (select auth.uid()))
  with check (org_id = public.current_org_id() and rep_id = (select auth.uid()));
grant select,insert,update on public.agent_presence to authenticated;

create table if not exists public.daily_submissions (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  notes text not null default '',
  submitted_at timestamptz not null default now(),
  unique(rep_id, day),
  constraint daily_submission_id check (id = rep_id::text || '|' || day::text)
);
create index if not exists daily_submissions_org_day_idx on public.daily_submissions(org_id, day desc);
alter table public.daily_submissions enable row level security;
create policy daily_submissions_select on public.daily_submissions for select to authenticated
  using (org_id = public.current_org_id()
      and (rep_id = (select auth.uid()) or public.current_user_role() in ('owner','admin','manager')));
create policy daily_submissions_insert on public.daily_submissions for insert to authenticated
  with check (org_id = public.current_org_id() and rep_id = (select auth.uid()));
create policy daily_submissions_update on public.daily_submissions for update to authenticated
  using (org_id = public.current_org_id() and rep_id = (select auth.uid()))
  with check (org_id = public.current_org_id() and rep_id = (select auth.uid()));
create policy daily_submissions_delete on public.daily_submissions for delete to authenticated
  using (org_id = public.current_org_id() and rep_id = (select auth.uid()));
grant select,insert,update,delete on public.daily_submissions to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_presence') then
    alter publication supabase_realtime add table public.agent_presence;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='daily_submissions') then
    alter publication supabase_realtime add table public.daily_submissions;
  end if;
end $$;


-- Harden inherited door policies: reps must never create a row for another
-- company's rep (or spoof another agent within their own company).
drop policy if exists street_write on public.street_rows;
create policy street_write on public.street_rows for all to authenticated
  using (
    org_id = public.current_org_id()
    and (rep_id = auth.uid() or public.current_user_role() in ('owner','admin','manager'))
  )
  with check (
    org_id = public.current_org_id()
    and (rep_id = auth.uid() or public.current_user_role() in ('owner','admin','manager'))
    and exists (
      select 1 from public.profiles p
      where p.id = rep_id and p.org_id = public.current_org_id()
    )
  );

drop policy if exists homes_write on public.homes;
create policy homes_write on public.homes for all to authenticated
  using (
    org_id = public.current_org_id()
    and (rep_id = auth.uid() or public.current_user_role() in ('owner','admin','manager'))
  )
  with check (
    org_id = public.current_org_id()
    and (rep_id = auth.uid() or public.current_user_role() in ('owner','admin','manager'))
    and (rep_id is null or exists (
      select 1 from public.profiles p
      where p.id = rep_id and p.org_id = public.current_org_id()
    ))
  );


-- Earlier migrations did not add this column although the Street Sheet
-- mapper uses it. Add it before backfilling/indexing, even on upgraded sites.
alter table public.street_rows
  add column if not exists slot integer;

-- A rep working from two devices can race to create the same street-sheet
-- slot. Preserve both sets of notes, but let the UI reposition overflow rows.
with ranked as (
  select id, row_number() over (
    partition by rep_id, day, slot order by created_at asc, id asc
  ) as position
  from public.street_rows where slot is not null
)
update public.street_rows s set slot = null
from ranked r where s.id = r.id and r.position > 1;

create unique index if not exists street_rows_one_slot_per_agent_day
  on public.street_rows (rep_id, day, slot) where slot is not null;
