// Unit tests for the pure production data-layer logic.
// Run: node --test test/api.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/api/mappers.js";
import { createCache } from "../src/api/cache.js";
import { createLocationQueue } from "../src/api/locationQueue.js";

test("home round-trips through row mapping", () => {
  const h = { id: "h1", repId: "r1", addr: "1 Maple", lat: 33.7, lng: -84.3, status: "appt",
    contact: "Al", phone: "555", notes: "knock am", due: "2026-07-01", activity: [{ type: "knocked", ts: 1 }] };
  const back = M.homeFromRow(M.homeToRow(h, "org1"));
  assert.equal(back.repId, "r1");
  assert.equal(back.status, "appt");
  assert.equal(back.addr, "1 Maple");
  assert.deepEqual(back.activity, [{ type: "knocked", ts: 1 }]);
});

test("deal value converts dollars <-> cents", () => {
  const row = M.dealToRow({ id: "d1", repId: "r1", homeId: "h1", customer: "C", product: "Solar", value: 12000 }, "org1");
  assert.equal(row.value_cents, 1200000);
  assert.equal(M.dealFromRow(row).value, 12000);
});

test("territory polygon round-trips (lat/lng order + closed ring)", () => {
  const ring = [[33.70, -84.40], [33.72, -84.40], [33.72, -84.38]];
  const row = M.territoryToRow({ id: "t1", name: "North", color: "#000", assignedTo: "r1", boundary: ring, start: "", end: "", notes: "" }, "org1");
  assert.equal(row.boundary.type, "Polygon");
  // GeoJSON is [lng, lat] and the ring is closed
  assert.deepEqual(row.boundary.coordinates[0][0], [-84.40, 33.70]);
  const back = M.territoryFromRow(row).boundary;
  assert.deepEqual(back[0], [33.70, -84.40]);
  assert.ok(back.length >= 3);
});

test("cache: fresh vs stale honors TTL and clock", () => {
  let t = 0;
  const c = createCache({ now: () => t });
  c.set("k", "v", 100);
  t = 50; assert.deepEqual(c.get("k"), { hit: true, value: "v", fresh: true });
  t = 150; assert.equal(c.get("k").fresh, false);
  assert.equal(c.get("missing").hit, false);
});

test("cache: swr returns stale immediately then revalidates", async () => {
  let t = 0;
  const c = createCache({ now: () => t });
  c.set("k", "old", 100);
  t = 200;
  let updated;
  const v = await c.swr("k", async () => "new", 100, (nv) => { updated = nv; });
  assert.equal(v, "old"); // stale value served instantly
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(updated, "new");
  assert.equal(c.get("k").value, "new"); // background revalidation landed
});

test("locationQueue retains buffer on failure (offline-safe), drains on success", async () => {
  let mode = "fail";
  const q = createLocationQueue({ send: async (b) => { if (mode === "fail") throw new Error("net"); return { accepted: b.length }; }, now: () => 0 });
  q.enqueue({ lat: 1, lng: 2 });
  q.enqueue({ lat: 3, lng: 4 });
  let r = await q.flush();
  assert.equal(r.error, true);
  assert.equal(q.size(), 2);        // nothing lost while offline
  assert.equal(q.failures(), 1);

  mode = "ok";
  r = await q.flush();
  assert.equal(r.accepted, 2);
  assert.equal(q.size(), 0);
  assert.equal(q.failures(), 0);
});

test("locationQueue backoff grows with consecutive failures", () => {
  const q = createLocationQueue({ send: async () => { throw new Error("x"); }, now: () => 0 });
  assert.equal(q.nextDelay(1000), 1000); // 0 failures
  q.enqueue({ lat: 1, lng: 1 });
  return q.flush().then(() => { assert.equal(q.nextDelay(1000), 2000); }); // 1 failure → doubled
});
