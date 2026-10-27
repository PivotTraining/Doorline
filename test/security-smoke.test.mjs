import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocationQueue } from "../src/api/locationQueue.js";
import { toCSV, parseCSV } from "../src/lib/csv.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const migration = read("supabase/migrations/0020_active_agent_rpc_hardening.sql");
const ingest = read("supabase/functions/ingest-locations/index.ts");
const team = read("supabase/functions/create-team-member/index.ts");

test("SECURITY: record_door_activity restricts both company and door ownership", () => {
  assert.match(migration, /create or replace function public\.record_door_activity/);
  assert.match(migration, /v_org <> public\.current_org_id\(\)/);
  assert.match(migration, /v_owner is distinct from auth\.uid\(\)/);
  assert.match(migration, /raise exception 'door not in your authorized territory'/);
  assert.match(migration, /revoke execute on function public\.record_door_activity\(uuid, text\)/);
});

test("SECURITY: disabled profiles lose their tenant scope even with old sessions", () => {
  assert.match(migration, /create or replace function public\.current_org_id/);
  assert.match(migration, /p\.status = 'active'/);
  assert.match(migration, /create or replace function public\.current_user_role/);
  assert.match(migration, /revoke execute on function public\.downsample_tracks/);
  assert.match(migration, /revoke execute on function public\.refresh_analytics/);
});

test("SMOKE: browser edge functions handle authenticated CORS preflight", () => {
  for (const source of [ingest, team]) {
    assert.match(source, /if \(req\.method === "OPTIONS"\)/);
    assert.match(source, /"Access-Control-Allow-Origin": "\*"/);
    assert.match(source, /"Access-Control-Allow-Headers":/);
    assert.match(source, /"Access-Control-Allow-Methods": "POST, OPTIONS"/);
    assert.match(source, /headers: \{ \.\.\.corsHeaders, "content-type": "application\/json" \}/);
    assert.ok(source.indexOf('req.method === "OPTIONS"') <
              source.indexOf('req.method !== "POST"'),
              "preflight must be handled before rejecting non-POST requests");
  }
});

test("SECURITY: privileged edge endpoints verify active roles", () => {
  assert.match(ingest, /profile\.status !== "active" \|\| profile\.role !== "rep"/);
  assert.match(team, /caller\.status !== "active"/);
  assert.match(ingest, /Number\.isFinite\(p\.lat\)/);
  assert.match(ingest, /body\.points\.length > MAX_BATCH/);
  assert.match(ingest, /points\.length !== body\.points\.length/);
});

test("SMOKE: GPS queue serializes concurrent flushes", async () => {
  let resolveRequest;
  let calls = 0;
  const q = createLocationQueue({ send: () => {
    calls++;
    return new Promise((resolve) => { resolveRequest = resolve; });
  } });
  q.enqueue({ lat: 33.7, lng: -84.3 });
  const inFlight = q.flush();
  const duplicate = await q.flush();
  assert.equal(duplicate.accepted, 0);
  assert.equal(calls, 1);
  resolveRequest({ accepted: 1 });
  assert.equal((await inFlight).accepted, 1);
  assert.equal(q.size(), 0);
});

test("SMOKE: GPS queue does not lose samples after partial acceptance", async () => {
  const sent = [];
  const q = createLocationQueue({ send: async (items) => {
    sent.push(items.length);
    return { accepted: sent.length === 1 ? 1 : items.length };
  } });
  q.enqueue({ lat: 1, lng: 2 });
  q.enqueue({ lat: 3, lng: 4 });
  q.enqueue({ lat: 5, lng: 6 });
  assert.equal((await q.flush()).accepted, 1);
  assert.equal(q.size(), 2);
  assert.equal((await q.flush()).accepted, 2);
  assert.equal(q.size(), 0);
  assert.deepEqual(sent, [3, 2]);
});

test("SECURITY: invalid coordinates do not enter GPS batches", async () => {
  const q = createLocationQueue({ send: async () => ({ accepted: 1 }) });
  assert.equal(q.enqueue({ lat: NaN, lng: -84 }), false);
  assert.equal(q.enqueue({ lat: 101, lng: 200 }), false);
  assert.equal(q.enqueue({ lat: 33.7, lng: -84.3 }), true);
  assert.equal(q.size(), 1);
});

test("SECURITY: CSV export never executes spreadsheet formulas from user data", () => {
  const csv = toCSV([
    { Email: "person@example.test", Note: "=1+2", Phone: "+15551234567", "=@DANGEROUS": "-cmd" },
  ]);
  const { headers, rows } = parseCSV(csv);
  assert.equal(headers[3], "'=@DANGEROUS");
  assert.equal(rows[0].Note, "'=1+2");
  assert.equal(rows[0].Phone, "'+15551234567");
  assert.equal(rows[0]["'=@DANGEROUS"], "'-cmd");
  assert.ok(csv.includes("\n"));
});
