-- ============================================================
-- Doorline 0021 — campaigns, offices, campaign documents, billing ledger
-- Depends on 0001-0020.
--
-- Campaigns were never a real entity: they lived as a jsonb array in
-- organizations.products (see 0009), each entry either a bare string (the
-- legacy shape) or an object {id,name,description,promo,enrollmentUrl,
-- active,commissionType,commissionAmount}. Nothing linked an agent to a
-- campaign, which blocked every campaign-scoped feature: filtering team
-- stats by campaign, picking agents for a territory from a campaign,
-- per-campaign documents, and showing which campaigns an agent is
-- onboarded with.
--
-- This promotes campaigns to a table, adds agent membership, adds a
-- documents table backed by a private Storage bucket, adds an office
-- entity for grouping agents (Team/Office/Manager filters), and adds a
-- plain billing ledger.
--
-- !! organizations.products IS DELIBERATELY LEFT IN PLACE !!
-- The currently deployed client reads campaigns from that column. Dropping
-- it here would break production the moment this migration ran, before the
-- new client ships. The column is backfilled FROM, never removed; a later
-- migration can drop it once no deployed client reads it.
-- ============================================================

-- ---------- offices (groups agents for Team/Office/Manager filters) ------
create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists offices_org_name_idx
  on public.offices (org_id, lower(trim(name)));

alter table public.profiles
  add column if not exists office_id uuid references public.offices(id) on delete set null;
create index if not exists profiles_office_idx on public.profiles (office_id);

alter table public.offices enable row level security;
drop policy if exists offices_select on public.offices;
create policy offices_select on public.offices for select to authenticated
  using (org_id = public.current_org_id());
drop policy if exists offices_write on public.offices;
create policy offices_write on public.offices for all to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin'))
  with check (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin'));
grant select, insert, update, delete on public.offices to authenticated;

-- ---------- campaigns ----------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The client's old synthetic id ("c0", "c1", ...) so anything still
  -- holding one can be matched back to the migrated row.
  legacy_key text,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  promo text not null default '',
  enrollment_url text not null default '',
  active boolean not null default true,
  commission_type text not null default 'flat' check (commission_type in ('flat','percent')),
  -- Dual meaning, matching the jsonb it replaces: dollars per closed deal
  -- when flat, percent of contract value when percent. numeric, not cents,
  -- so a percentage like 7.5 survives the move intact.
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists campaigns_org_name_idx
  on public.campaigns (org_id, lower(trim(name)));
create index if not exists campaigns_org_active_idx on public.campaigns (org_id, active);

alter table public.campaigns enable row level security;
-- Every member of the company may read the campaign list: reps need their
-- own campaigns, and the admin filters need all of them.
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated
  using (org_id = public.current_org_id());
drop policy if exists campaigns_write on public.campaigns;
create policy campaigns_write on public.campaigns for all to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin','manager'))
  with check (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin','manager'));
grant select, insert, update, delete on public.campaigns to authenticated;

-- ---------- campaign membership (which agents are onboarded) -------------
create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (campaign_id, rep_id)
);
create index if not exists campaign_members_rep_idx on public.campaign_members (rep_id);
create index if not exists campaign_members_org_idx on public.campaign_members (org_id);

alter table public.campaign_members enable row level security;
-- An agent sees their own memberships; managers and above see everyone's,
-- which the campaign filters and the Personnel campaign list both need.
drop policy if exists campaign_members_select on public.campaign_members;
create policy campaign_members_select on public.campaign_members for select to authenticated
  using (org_id = public.current_org_id()
         and (rep_id = (select auth.uid()) or public.current_user_role() in ('owner','admin','manager')));
drop policy if exists campaign_members_write on public.campaign_members;
create policy campaign_members_write on public.campaign_members for all to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin','manager'))
  with check (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin','manager'));
grant select, insert, update, delete on public.campaign_members to authenticated;

-- ---------- campaign documents -------------------------------------------
-- Rows are metadata only; bytes live in the private 'campaign-docs' bucket
-- at <org_id>/<campaign_id>/<filename>, which the policies below rely on.
create table if not exists public.campaign_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campaign_documents_campaign_idx
  on public.campaign_documents (campaign_id, created_at desc);

alter table public.campaign_documents enable row level security;
-- Readable by managers and above, or by an agent onboarded on that campaign.
drop policy if exists campaign_documents_select on public.campaign_documents;
create policy campaign_documents_select on public.campaign_documents for select to authenticated
  using (org_id = public.current_org_id()
         and (public.current_user_role() in ('owner','admin','manager')
              or exists (select 1 from public.campaign_members m
                          where m.campaign_id = campaign_documents.campaign_id
                            and m.rep_id = (select auth.uid()))));
-- Only administrators upload or remove them.
drop policy if exists campaign_documents_write on public.campaign_documents;
create policy campaign_documents_write on public.campaign_documents for all to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin'))
  with check (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin'));
grant select, insert, update, delete on public.campaign_documents to authenticated;

-- Private bucket: every download goes through a signed URL, so an object
-- is never readable just by knowing its path.
insert into storage.buckets (id, name, public)
  values ('campaign-docs', 'campaign-docs', false)
  on conflict (id) do nothing;

drop policy if exists campaign_docs_read on storage.objects;
create policy campaign_docs_read on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-docs'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (public.current_user_role() in ('owner','admin','manager')
         or exists (select 1 from public.campaign_members m
                     where m.rep_id = (select auth.uid())
                       and m.campaign_id::text = (storage.foldername(name))[2]))
  );
drop policy if exists campaign_docs_write on storage.objects;
create policy campaign_docs_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-docs'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.current_user_role() in ('owner','admin')
  );
drop policy if exists campaign_docs_delete on storage.objects;
create policy campaign_docs_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'campaign-docs'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.current_user_role() in ('owner','admin')
  );

-- ---------- billing ledger -----------------------------------------------
-- Admin-recorded, no payment processor. Amount due is charges minus
-- payments, so neither table stores a running balance to drift.
create table if not exists public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents >= 0),
  period_start date,
  period_end date,
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);
create index if not exists billing_charges_org_idx
  on public.billing_charges (org_id, created_at desc);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null default 'other'
    check (method in ('card','ach','check','cash','wire','other')),
  reference text,
  -- Receipt identifier shown to the company; unique within the company.
  receipt_number text not null check (length(trim(receipt_number)) > 0),
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, receipt_number)
);
create index if not exists billing_payments_org_idx
  on public.billing_payments (org_id, paid_at desc);

-- Company finances are owner/admin only -- reps and managers never see them.
alter table public.billing_charges enable row level security;
drop policy if exists billing_charges_rw on public.billing_charges;
create policy billing_charges_rw on public.billing_charges for all to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin'))
  with check (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin'));
grant select, insert, update, delete on public.billing_charges to authenticated;

alter table public.billing_payments enable row level security;
drop policy if exists billing_payments_rw on public.billing_payments;
create policy billing_payments_rw on public.billing_payments for all to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin'))
  with check (org_id = public.current_org_id() and public.current_user_role() in ('owner','admin'));
grant select, insert, update, delete on public.billing_payments to authenticated;

-- ---------- backfill campaigns from organizations.products ---------------
-- Idempotent: re-running adds nothing, because of campaigns_org_name_idx.
do $$
declare
  o record;
  item jsonb;
  idx integer;
  nm text;
begin
  for o in select id, products from public.organizations
            where products is not null and jsonb_typeof(products) = 'array'
  loop
    idx := 0;
    for item in select value from jsonb_array_elements(o.products) as t(value)
    loop
      if jsonb_typeof(item) = 'string' then
        -- Legacy entry: the whole value is just the campaign name.
        nm := trim(item #>> '{}');
        if nm <> '' then
          insert into public.campaigns (org_id, legacy_key, name)
            values (o.id, 'c' || idx, nm)
            on conflict do nothing;
        end if;
      elsif jsonb_typeof(item) = 'object' then
        nm := trim(coalesce(item->>'name', ''));
        if nm <> '' then
          insert into public.campaigns (
            org_id, legacy_key, name, description, promo, enrollment_url,
            active, commission_type, commission_amount
          ) values (
            o.id,
            coalesce(nullif(item->>'id', ''), 'c' || idx),
            nm,
            coalesce(item->>'description', ''),
            coalesce(item->>'promo', ''),
            coalesce(item->>'enrollmentUrl', ''),
            coalesce((item->>'active')::boolean, true),
            case when item->>'commissionType' = 'percent' then 'percent' else 'flat' end,
            coalesce(nullif(item->>'commissionAmount', '')::numeric, 0)
          )
          on conflict do nothing;
        end if;
      end if;
      idx := idx + 1;
    end loop;
  end loop;
end $$;
