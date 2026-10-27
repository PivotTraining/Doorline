import test from "node:test";
import assert from "node:assert/strict";
import { tenantStorageKey } from "../src/lib/tenantScope.js";
import { createWriteQueue } from "../src/api/writeQueue.js";

test("offline queues have distinct keys per company and authenticated agent", () => {
  const a = tenantStorageKey("writes", { orgId: "company-a", repId: "agent-a" });
  const b = tenantStorageKey("writes", { orgId: "company-b", repId: "agent-a" });
  const c = tenantStorageKey("writes", { orgId: "company-a", repId: "agent-b" });
  assert.ok(a && a !== b && a !== c);
  assert.equal(tenantStorageKey("writes", { repId: "agent-a" }), null);
  assert.notEqual(tenantStorageKey("locations", { orgId: "company-a", repId: "agent-a" }), a);
});

test("persisted offline street edits cannot load from another company's queue", () => {
  const original = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  try {
    const handlers = {
      street_rows: { upsert: async () => ({ error: null }), del: async () => ({ error: null }) },
    };
    const scoped = (orgId, repId) => createWriteQueue({
      handlers, storageKey: tenantStorageKey("writes", { orgId, repId }),
    });
    const a = scoped("company-a", "agent-a");
    a.enqueue("street_rows", "upsert", { id: "row-1", repId: "agent-a" });
    assert.equal(scoped("company-b", "agent-a").size(), 0);
    assert.equal(scoped("company-a", "agent-b").size(), 0);
    assert.equal(scoped("company-a", "agent-a").size(), 1);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test("an account switch parks pending writes instead of sending them as another user", async () => {
  let stillOwner = true;
  const delivered = [];
  const q = createWriteQueue({
    handlers: { street_rows: {
      upsert: async (r) => { delivered.push(r); return { error: null }; },
      del: async () => ({ error: null }),
    } },
    persist: false,
    canFlush: () => stillOwner,
  });
  q.enqueue("street_rows", "upsert", { id: "row-a", repId: "agent-a" });
  stillOwner = false;
  assert.equal((await q.flush()).flushed, 0);
  assert.equal(q.size(), 1);
  assert.equal(delivered.length, 0);
  stillOwner = true;
  assert.equal((await q.flush()).flushed, 1);
  assert.equal(delivered.length, 1);
});
