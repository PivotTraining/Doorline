import test from "node:test";
import assert from "node:assert/strict";
import { overlayPending } from "../src/lib/pendingOverlay.js";

test("offline Street Sheet edit survives a stale server snapshot", () => {
  const snap = { streetRows: [{ id: "a", repId: "rep1", slot: 3, street: "Old Address" }] };
  const result = overlayPending(snap, [{
    table: "street_rows", op: "upsert", id: "a",
    payload: { id: "a", repId: "rep1", slot: 3, street: "New Address" },
  }]);
  assert.equal(result.streetRows[0].street, "New Address");
  assert.equal(snap.streetRows[0].street, "Old Address");
});

test("pending insert, delete, and closeout survive refresh", () => {
  const snap = { streetRows: [{ id: "old", street: "X" }], submittedDays: {} };
  const result = overlayPending(snap, [
    { table: "street_rows", op: "upsert", id: "new", payload: { id: "new", slot: 1, street: "Y" } },
    { table: "street_rows", op: "delete", id: "old", payload: "old" },
    { table: "daily_submissions", op: "upsert", id: "rep1|2026-10-26",
      payload: { id: "rep1|2026-10-26", submittedAt: 123, notes: "Follow up" } },
  ]);
  assert.deepEqual(result.streetRows.map((r) => r.id), ["new"]);
  assert.equal(result.submittedDays["rep1|2026-10-26"].notes, "Follow up");
  assert.equal(snap.streetRows.length, 1);
});

test("report-only resync does not invent slices from other snapshots", () => {
  const data = overlayPending({ reportRows: [] }, [
    { table: "street_rows", op: "upsert", id: "x", payload: { id: "x" } },
  ]);
  assert.equal(Object.hasOwn(data, "streetRows"), false);
});
