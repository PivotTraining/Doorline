-- ============================================================
-- Doorline 0015 — shared master reports (reps see their own slice)
-- An admin uploads a master report, maps rows to reps, and publishes: each
-- row lands here tagged to a rep. Reps read only their own; managers/admins
-- read the whole org.
-- ============================================================
create table if not exists report_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  cols jsonb not null default '[]'::jsonb,     -- header order for display/download
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists report_batches_org_idx on report_batches (org_id, created_at desc);

create table if not exists report_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  batch_id uuid not null references report_batches(id) on delete cascade,
  rep_id uuid references profiles(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists report_rows_rep_idx on report_rows (rep_id);
create index if not exists report_rows_batch_idx on report_rows (batch_id);

alter table report_batches enable row level security;
alter table report_rows    enable row level security;

-- batches: whole org can read (just metadata); managers+ manage
create policy report_batches_read on report_batches for select using (org_id = current_org_id());
create policy report_batches_write on report_batches for all
  using (org_id = current_org_id() and current_user_role() in ('owner','admin','manager'))
  with check (org_id = current_org_id() and current_user_role() in ('owner','admin','manager'));

-- rows: a rep reads only their own; managers+ read/manage the whole org
create policy report_rows_read on report_rows for select
  using (org_id = current_org_id() and (rep_id = auth.uid() or current_user_role() in ('owner','admin','manager')));
create policy report_rows_write on report_rows for all
  using (org_id = current_org_id() and current_user_role() in ('owner','admin','manager'))
  with check (org_id = current_org_id() and current_user_role() in ('owner','admin','manager'));
