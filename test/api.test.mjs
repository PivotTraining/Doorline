// Unit tests for the pure production data-layer logic.
// Run: node --test test/api.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/api/mappers.js";
import { createCache } from "../src/api/cache.js";
import { createLocationQueue } from "../src/api/locationQueue.js";
import { createWriteQueue } from "../src/api/writeQueue.js";
import { repCode, normalizeCampaign, normalizeCampaigns, personalizedEnrollUrl } from "../src/lib/campaigns.js";
import { pointInPolygon } from "../src/lib/geo.js";
import { toCSV } from "../src/lib/csv.js";
import { localDay, localDayInTZ } from "../src/lib/date.js";

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

test("deal timestamp round-trips through created_at (powers the weekly My Deals view)", () => {
  const ts = Date.parse("2026-06-01T12:00:00Z");
  const row = M.dealToRow({ id: "d1", repId: "r1", homeId: null, customer: "C", product: "Solar", value: 100, ts }, "org1");
  assert.equal(row.created_at, new Date(ts).toISOString());
  assert.equal(M.dealFromRow(row).ts, ts);
});

test("localDay uses the LOCAL calendar date, unlike toISOString (the timezone bug this fixes)", () => {
  const prevTZ = process.env.TZ;
  process.env.TZ = "America/New_York"; // UTC-4/-5
  try {
    // Jan 1 02:00 UTC is still Dec 31 evening in US Eastern — a rep working
    // that evening should have their door land on Dec 31, not Jan 1.
    const d = new Date(Date.UTC(2026, 0, 1, 2, 0, 0));
    assert.equal(d.toISOString().slice(0, 10), "2026-01-01"); // the buggy UTC-based value
    assert.equal(localDay(d), "2025-12-31"); // the correct local-date value
  } finally {
    process.env.TZ = prevTZ;
  }
});

test("localDayInTZ resolves a REP'S OWN stored timezone, independent of the viewer/server's own", () => {
  // The same instant — Jan 1 02:00 UTC — is already Jan 1 in Hawaii-Aleutian
  // (UTC-10, still before midnight) but still Dec 31 in Eastern. A manager in
  // one timezone checking a rep's sheet must see THAT REP'S day, not their own.
  const instant = new Date(Date.UTC(2026, 0, 1, 2, 0, 0));
  assert.equal(localDayInTZ("America/New_York", instant), "2025-12-31");
  assert.equal(localDayInTZ("Pacific/Honolulu", instant), "2025-12-31");
  assert.equal(localDayInTZ("Europe/London", instant), "2026-01-01");
  // No timezone on file falls back to the local machine's date rather than throwing.
  assert.equal(localDayInTZ(null, instant), localDay(instant));
  // An invalid/unknown zone string degrades gracefully instead of crashing the page.
  assert.doesNotThrow(() => localDayInTZ("Not/AZone", instant));
});

test("street row round-trips including the Not Qualified disposition", () => {
  const r = { id: "s1", repId: "r1", date: "2026-07-08", street: "1 Maple", nh: false, rl: false,
    dm: false, bid: false, d: false, ni: false, nq: true, customer: "C", phone: "555", comments: "", cb: "5:30", done: false, snoozeUntil: 0 };
  const back = M.streetRowFromRow(M.streetRowToRow(r, "org1"));
  assert.equal(back.nq, true);
  assert.equal(back.cb, "5:30");
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

test("pointInPolygon: inside vs outside a square zone", () => {
  const square = [[33.70, -84.40], [33.72, -84.40], [33.72, -84.38], [33.70, -84.38]];
  assert.equal(pointInPolygon([33.71, -84.39], square), true);   // center
  assert.equal(pointInPolygon([33.75, -84.39], square), false);  // north of zone
  assert.equal(pointInPolygon([33.71, -84.50], square), false);  // west of zone
});

test("toCSV: headers, ordering, and escaping", () => {
  const csv = toCSV([{ Rep: "Jordan", Note: 'said "no, thanks"', Doors: 7 }, { Rep: "Tasha", Note: "a,b", Doors: 3 }]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "Rep,Note,Doors");
  assert.equal(lines[1], 'Jordan,"said ""no, thanks""",7');
  assert.equal(lines[2], 'Tasha,"a,b",3');
  assert.equal(toCSV([]), "");
});

test("writeQueue retains a failed write and retries it (offline-safe)", async () => {
  let mode = "fail";
  const calls = [];
  const handlers = { homes: { upsert: async (h) => { calls.push(h.id); if (mode === "fail") throw new Error("net"); }, del: async () => {} } };
  const q = createWriteQueue({ handlers, persist: false });
  q.enqueue("homes", "upsert", { id: "h1", addr: "1 Maple" });
  let r = await q.flush();
  assert.equal(r.flushed, 0);
  assert.equal(q.size(), 1); // nothing lost while the request is failing

  mode = "ok";
  r = await q.flush();
  assert.equal(r.flushed, 1);
  assert.equal(q.size(), 0);
  assert.deepEqual(calls, ["h1", "h1"]); // first attempt failed, second landed
});

test("writeQueue collapses a superseded write instead of replaying stale state", async () => {
  const applied = [];
  const handlers = { homes: { upsert: async (h) => { applied.push(h.status); }, del: async () => {} } };
  const q = createWriteQueue({ handlers, persist: false });
  q.enqueue("homes", "upsert", { id: "h1", status: "untouched" });
  q.enqueue("homes", "upsert", { id: "h1", status: "sold" }); // supersedes the first before it ever flushed
  assert.equal(q.size(), 1);
  await q.flush();
  assert.deepEqual(applied, ["sold"]); // only the latest state was ever sent
});

test("writeQueue notifies subscribers of the pending count as it changes", async () => {
  const handlers = { deals: { upsert: async () => {}, del: async () => {} } };
  const q = createWriteQueue({ handlers, persist: false });
  const seen = [];
  q.subscribe((n) => seen.push(n));
  q.enqueue("deals", "upsert", { id: "d1" });
  await q.flush();
  assert.deepEqual(seen, [1, 0]); // queued, then drained
});

test("repCode is a stable 6-char code derived from the profile id", () => {
  assert.equal(repCode("7a3f9c66-1234-5678-9abc-def012345678"), "7A3F9C");
  assert.equal(repCode("7a3f9c66-1234-5678-9abc-def012345678"), repCode("7a3f9c66-1234-5678-9abc-def012345678")); // stable
  assert.equal(repCode("ab").length, 6); // short ids padded, never crash
  assert.equal(repCode(null), "------");
});

test("normalizeCampaign upgrades a legacy string entry without losing it", () => {
  assert.deepEqual(normalizeCampaign("Solar", 2), { id: "c2", name: "Solar", description: "", promo: "", enrollmentUrl: "", active: true });
  const obj = { id: "x", name: "Gas", description: "d", promo: "p", enrollmentUrl: "u", active: false };
  assert.deepEqual(normalizeCampaign(obj), obj);
  assert.equal(normalizeCampaigns(["A", "B"]).length, 2);
  assert.deepEqual(normalizeCampaigns(null), []);
});

test("personalizedEnrollUrl injects the rep code (placeholder or ?ref fallback)", () => {
  assert.equal(personalizedEnrollUrl("https://x.com?agent={code}", "7A3F9C"), "https://x.com?agent=7A3F9C");
  assert.equal(personalizedEnrollUrl("https://x.com/{rep}", "7A3F9C"), "https://x.com/7A3F9C");
  assert.equal(personalizedEnrollUrl("https://x.com/enroll", "7A3F9C"), "https://x.com/enroll?ref=7A3F9C");
  assert.equal(personalizedEnrollUrl("https://x.com?a=1", "7A3F9C"), "https://x.com?a=1&ref=7A3F9C");
  assert.equal(personalizedEnrollUrl("", "7A3F9C"), "");
});

test("locationQueue backoff grows with consecutive failures", () => {
  const q = createLocationQueue({ send: async () => { throw new Error("x"); }, now: () => 0 });
  assert.equal(q.nextDelay(1000), 1000); // 0 failures
  q.enqueue({ lat: 1, lng: 1 });
  return q.flush().then(() => { assert.equal(q.nextDelay(1000), 2000); }); // 1 failure → doubled
});
