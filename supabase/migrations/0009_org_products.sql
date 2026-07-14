-- ============================================================
-- Doorline 0009 — org-managed product/campaign list
-- Reps pick from this list when marking a deal on the Street Sheet or a
-- door. Real orgs set their own real campaign names here (Settings); it
-- is never pre-filled with guessed-at product names.
-- ============================================================
alter table organizations
  add column if not exists products jsonb;
