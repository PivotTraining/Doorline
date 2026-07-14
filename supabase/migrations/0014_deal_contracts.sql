-- ============================================================
-- Doorline 0014 — lightweight contracts on a deal
-- Captures the customer's on-screen signature, their printed name, when
-- they signed, and a snapshot of the terms they agreed to. Stored on the
-- deal so managers see the signed contract too, not just the rep's device.
-- (signature is a small PNG data URL kept in a text column.)
-- ============================================================
alter table deals
  add column if not exists signature text,
  add column if not exists signed_name text,
  add column if not exists signed_at timestamptz,
  add column if not exists contract_terms text;
