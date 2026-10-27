-- Doorline production read-only smoke / security audit.
-- Run in Doorline's Supabase SQL Editor, after migrations 0019 and 0020.
-- SELECT-only: makes no changes to authentication, records or RLS policies.
-- Every returned status should be PASS. An ERROR means migration/schema drift.
with results as (
  select 'company_invites exists'::text as test,
    to_regclass('public.company_invites') is not null as ok
  union all select 'agent_presence exists',
    to_regclass('public.agent_presence') is not null
  union all select 'daily_submissions exists',
    to_regclass('public.daily_submissions') is not null
  union all select 'street_rows.slot exists',
    exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='street_rows' and column_name='slot')
  union all select 'company_invites RLS enabled',
    exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='company_invites' and c.relrowsecurity)
  union all select 'agent_presence RLS enabled',
    exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='agent_presence' and c.relrowsecurity)
  union all select 'daily_submissions RLS enabled',
    exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='daily_submissions' and c.relrowsecurity)
  union all select 'presence INSERT owned by rep',
    exists(select 1 from pg_policies
      where schemaname='public' and tablename='agent_presence'
        and policyname='agent_presence_insert' and cmd='INSERT'
        and with_check like '%auth.uid()%')
  union all select 'closeout UPDATE restricted to rep',
    exists(select 1 from pg_policies
      where schemaname='public' and tablename='daily_submissions'
        and policyname='daily_submissions_update' and cmd='UPDATE'
        and with_check like '%auth.uid()%')
  union all select 'invitation table inaccessible to anon',
    not has_table_privilege('anon','public.company_invites','SELECT')
  union all select 'no public invite generation',
    not has_function_privilege('anon','public.create_company_invite(integer,integer)','EXECUTE')
  union all select 'no public door activity write',
    not has_function_privilege('anon','public.record_door_activity(uuid,text)','EXECUTE')
  union all select 'no client analytics refresh',
    not has_function_privilege('authenticated','public.refresh_analytics()','EXECUTE')
  union all select 'no client GPS downsample',
    not has_function_privilege('authenticated','public.downsample_tracks(date)','EXECUTE')
  union all select 'no client retention purge',
    not has_function_privilege('authenticated','public.purge_old_street_rows()','EXECUTE')
  union all select 'invite company lookup available for signup',
    has_function_privilege('anon','public.invited_company_name(text)','EXECUTE')
  union all select 'presence Realtime enabled',
    exists(select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='agent_presence')
  union all select 'closeout Realtime enabled',
    exists(select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='daily_submissions')
  union all select 'no presence with mismatched profile org',
    not exists(select 1 from public.agent_presence a
      join public.profiles p on p.id=a.rep_id where p.org_id is distinct from a.org_id)
  union all select 'no closeout with mismatched profile org',
    not exists(select 1 from public.daily_submissions d
      join public.profiles p on p.id=d.rep_id where p.org_id is distinct from d.org_id)
  union all select 'privileged door activity enforces org',
    position('v_org <> public.current_org_id()' in
      pg_get_functiondef('public.record_door_activity(uuid,text)'::regprocedure)) > 0
  union all select 'active profile required for org scope',
    position('p.status = ''active''' in
      pg_get_functiondef('public.current_org_id()'::regprocedure)) > 0
)
select test, case when ok then 'PASS' else 'FAIL' end as status
from results
order by ok, test;
