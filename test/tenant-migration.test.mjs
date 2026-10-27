import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0019_company_invites_presence_closeouts.sql", import.meta.url), "utf8");

test("Doorline tenant-enrollment migration has paired PL/pgSQL dollar quotes", () => {
  assert.doesNotMatch(sql, /as \$(?!\$)/);
  const quotes = sql.match(/\$\$/g) || [];
  assert.equal(quotes.length % 2, 0);
  assert.ok(quotes.length >= 6, "expected multiple stored functions");
});
test("migration denies rep writes across organizations and rejects duplicate slots", () => {
  assert.match(sql, /drop policy if exists street_write on public\.street_rows/);
  assert.match(sql, /p\.id = rep_id and p\.org_id = public\.current_org_id\(\)/);
  assert.match(sql, /street_rows_one_slot_per_agent_day/);
});
test("company invitations require a server-side token and role authorization", () => {
  assert.match(sql, /Only a company owner or admin can issue enrollment links/);
  assert.match(sql, /Company enrollment link expired or invalid/);
  assert.match(sql, /token_hash = encode\(sha256/);
});
