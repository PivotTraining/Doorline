-- ============================================================
-- Doorline 0006 — follow-up nudges
-- Phone + nudge state on street rows; manager follow-up rules on the org.
-- ============================================================
alter table street_rows
  add column if not exists phone text,
  add column if not exists done boolean not null default false,
  add column if not exists snooze_until bigint not null default 0;

alter table organizations
  add column if not exists followup jsonb;
