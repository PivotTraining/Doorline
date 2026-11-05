-- ============================================================
-- Doorline 0017 — persist the street-row ↔ deal link
--
-- Bug: marking "D" (Deal) on a Street Sheet row creates a deal and links it
-- client-side (street_rows.dealId in memory), but street_rows never had a
-- deal_id column and the client mapper never sent/read one. So the deal
-- itself saved fine, but the LINK from the row to its deal was never
-- persisted -- on refresh (or on any other device pulling a fresh copy),
-- every row's dealId reverts to null: the product picker vanishes from
-- that row, an unchecked "D" afterward won't clean up the orphaned deal
-- (unlinkStreetDeal never fires because dealId already reads null), and if
-- D gets re-checked, a SECOND duplicate deal gets created for the same
-- door. This is why it read as "the deal disappearing" on refresh.
-- ============================================================
alter table street_rows
  add column if not exists deal_id uuid references deals(id) on delete set null;

create index if not exists street_rows_deal_idx on street_rows (deal_id);
