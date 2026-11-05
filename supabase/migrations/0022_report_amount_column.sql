-- ============================================================
-- Doorline 0022 — record which pay-report column holds the money
--
-- A pay report is uploaded as arbitrary columns from whatever the carrier
-- or payroll system exported. The rows already carry rep_id, so the app
-- knows WHO each line is about, but nothing recorded WHICH column holds
-- the amount that person was paid -- so earnings could not be derived from
-- a pay report at all.
--
-- amount_col names that column, chosen by the administrator at upload.
-- Nullable on purpose: batches uploaded before this migration have no
-- answer, and guessing one would invent earnings rather than report them.
-- Those batches simply contribute nothing to earnings totals until someone
-- sets the column.
-- ============================================================
alter table report_batches
  add column if not exists amount_col text;
