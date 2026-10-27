-- Doorline 0020: security review follow-up after 0019.
-- Requires previous migrations 0001-0019. Apply to Doorline only.
--
-- CRITICAL: existing SECURITY DEFINER record_door_activity accepted any
-- home UUID, including homes owned by a different company. This patch
-- checks the caller's active membership, tenant and home ownership.
--
-- Resolve the caller's org/role only for active profiles. Existing RLS
-- policies and previously tenant-scoped RPCs automatically deny accounts
-- disabled by administrators (rather than trusting stale JWT claims).
create or replace function public.current_org_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.org_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active'
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active'
$$;

-- Keep these policies' RLS helper RPCs executable for authenticated callers;
-- the helpers return NULL to a deactivated or unauthenticated caller.
revoke execute on function public.current_org_id() from public, anon;
revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.record_door_activity(home_id uuid, atype text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_owner uuid;
  v_role public.user_role;
begin
  v_role := public.current_user_role();
  if auth.uid() is null or public.current_org_id() is null
     or v_role not in ('rep','manager','admin','owner') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select h.org_id, h.rep_id into v_org, v_owner
    from public.homes h where h.id = home_id;
  if v_org is null or v_org <> public.current_org_id()
     or (v_role = 'rep' and v_owner is distinct from auth.uid()) then
    raise exception 'door not in your authorized territory'
      using errcode = '42501';
  end if;

  if atype is null or length(trim(atype)) not between 1 and 64 then
    raise exception 'invalid door activity';
  end if;

  insert into public.door_activity(org_id, home_id, rep_id, type)
    values (v_org, home_id, auth.uid(), trim(atype));
  update public.homes
    set activity = activity || jsonb_build_object(
      'type', trim(atype), 'ts', extract(epoch from now()) * 1000
    ), updated_at = now()
    where id = home_id and org_id = v_org;
end $$;
revoke execute on function public.record_door_activity(uuid, text)
  from public, anon;
grant execute on function public.record_door_activity(uuid, text)
  to authenticated;

-- Consent state must not be written by inactive accounts or other roles.
create or replace function public.set_consent(granted boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_status public.consent_state;
begin
  v_org := public.current_org_id();
  if auth.uid() is null or v_org is null
     or public.current_user_role() <> 'rep' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_status := case when granted then 'granted' else 'denied' end;
  insert into public.consents(rep_id, org_id, state, updated_at)
    values (auth.uid(), v_org, v_status, now())
    on conflict (rep_id) do update
      set state = excluded.state, updated_at = now();
  insert into public.consent_audit(rep_id, org_id, state)
    values (auth.uid(), v_org, v_status);
end $$;
revoke execute on function public.set_consent(boolean) from public, anon;
grant execute on function public.set_consent(boolean) to authenticated;

-- Scheduled maintenance must never be callable by ordinary app users.
-- Supabase pg_cron runs the jobs as the privileged scheduler role.
revoke execute on function public.downsample_tracks(date)
  from public, anon, authenticated;
revoke execute on function public.refresh_analytics()
  from public, anon, authenticated;
revoke execute on function public.purge_old_street_rows()
  from public, anon, authenticated;
