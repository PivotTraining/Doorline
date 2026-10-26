// ============================================================
// Write-through dispatcher used by the store. Optimistic local
// state is the source of truth for the UI; these calls push the
// same change to Supabase. No-op in demo.
//
// Writes go through a durable queue (writeQueue.js): a rep working with
// patchy signal (very much the normal case door-to-door) can have a write
// fail outright, not just run slow. Silently dropping that -- as the old
// fire-and-forget version did -- loses their entry with no error and no
// way to tell anything went wrong. The queue persists to localStorage and
// retries until each write lands.
// ============================================================
import { DEMO, supabase } from "../supabaseClient";
import * as S from "./services";
import { createLocationQueue } from "./locationQueue";
import { createWriteQueue } from "./writeQueue";
import { getCtx } from "./context.js";
import { tenantStorageKey } from "../lib/tenantScope.js";

const live = () => !DEMO && !!supabase;

const HANDLERS = {
  homes: { upsert: S.upsertHome, del: () => {} }, // homes are never hard-deleted client-side
  deals: { upsert: S.upsertDeal, del: S.deleteDeal },
  profiles: { upsert: S.upsertProfile, del: S.deleteProfile },
  posts: { upsert: S.upsertPost, del: S.deletePost },
  territories: { upsert: S.upsertTerritory, del: S.deleteTerritory },
  street_rows: { upsert: S.upsertStreetRow, del: S.deleteStreetRow },
  daily_submissions: { upsert: S.upsertDailySubmission, del: S.deleteDailySubmission },
  organizations: { upsert: S.upsertOrg, del: () => {} },
  report_batches: { upsert: S.upsertReportBatch, del: S.deleteReportBatch },
  report_rows: { upsert: S.upsertReportRow, del: S.deleteReportRow },
};

// Publish many report rows at once (one insert instead of N). Falls back to
// the durable per-row queue if the bulk insert fails, so nothing is lost.
export async function bulkInsert(table, rows) {
  if (!live() || !rows?.length || !HANDLERS[table]) return;
  try {
    await S.bulkInsertReportRows(rows);
  } catch {
    for (const r of rows) up(table, r);
  }
}
let writeQueue = null;
let writeScope = null;
const currentWriteScope = () => tenantStorageKey("writes", getCtx());
function wq() {
  const scope = currentWriteScope();
  if (!scope) return null;
  if (scope !== writeScope) {
    writeScope = scope;
    writeQueue = createWriteQueue({ handlers: HANDLERS, storageKey: scope, canFlush: () => currentWriteScope() === scope });
  }
  return writeQueue;
}

export function up(table, e) {
  if (!live() || !e || !HANDLERS[table]) return;
  const queue = wq();
  if (!queue) { console.error("[doorline] skipped write without verified company/agent context"); return; }
  queue.enqueue(table, "upsert", e);
  queue.flush();
}
export function del(table, id) {
  if (!live() || !HANDLERS[table]) return;
  const queue = wq();
  if (!queue) { console.error("[doorline] skipped delete without verified company/agent context"); return; }
  queue.enqueue(table, "delete", id);
  queue.flush();
}
// Pending (not-yet-synced) write count, for a visible sync-status indicator.
export function pendingWrites() { return wq()?.size() ?? 0; }
export function subscribeWrites(fn) { return wq()?.subscribe(fn) ?? (() => {}); }
export function startWriteFlush(intervalMs = 10000) {
  if (!live()) return () => {};
  const scope = currentWriteScope();
  const assignedQueue = wq();
  if (!scope || !assignedQueue) return () => {};
  const flushOwn = () => { if (currentWriteScope() === scope) assignedQueue.flush(); };
  flushOwn();
  const id = setInterval(flushOwn, intervalMs);
  window.addEventListener("online", flushOwn);
  return () => { clearInterval(id); window.removeEventListener("online", flushOwn); };
}
// Not fire-and-forget: the caller needs the result (temp password / error).
export async function createTeamMember(payload) {
  if (!live()) return { error: "not_live" };
  try { return await S.createTeamMember(payload); }
  catch { return { error: "Could not reach the server. Check your connection and try again." }; }
}

// Fire-and-forget helper for best-effort RPCs (activity pings, consent,
// territory assignment) that don't go through the durable write queue --
// there's no local optimistic state to roll back if these fail, so the
// rejection is swallowed rather than left to throw uncaught, but still
// logged so a real outage is visible in devtools instead of invisible.
function safe(promise) {
  Promise.resolve(promise).catch((err) => console.error("[doorline] background sync failed:", err));
}

export const activity = (homeId, type) => { if (live()) safe(S.recordActivity(homeId, type)); };
export const consent = (granted) => { if (live()) safe(S.setConsentRpc(granted)); };
export function presence(point) {
  if (!live()) return Promise.resolve();
  return S.upsertAgentPresence(point).then(({ error }) => {
    if (error) { console.error("[doorline] agent presence failed:", error.message); throw error; }
  });
}
export const assignTerritory = (tid, repId) => { if (live()) safe(S.assignTerritory(tid, repId)); };

// ---- GPS firehose (client) ----
let queue = null;
let gpsScope = null;
async function sendBatch(points, expectedScope, expectedAgent) {
  if (tenantStorageKey("locations", getCtx()) !== expectedScope) throw new Error("gps_scope_changed");
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.access_token || data.session.user?.id !== expectedAgent
      || tenantStorageKey("locations", getCtx()) !== expectedScope) {
    throw new Error("gps_user_changed");
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${url}/functions/v1/ingest-locations`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error("ingest_failed");
  return res.json();
}
function q() {
  const ctx = getCtx();
  const scope = tenantStorageKey("locations", ctx);
  if (!scope) return null;
  if (gpsScope !== scope) {
    gpsScope = scope;
    const agentId = ctx.repId;
    queue = createLocationQueue({ send: (points) => sendBatch(points, scope, agentId) });
  }
  return queue;
}
export function location(pt) { if (live()) q()?.enqueue(pt); }
export function startLocationFlush(intervalMs = 15000) {
  if (!live()) return () => {};
  const scope = tenantStorageKey("locations", getCtx());
  const assignedQueue = q();
  if (!scope || !assignedQueue) return () => {};
  const flushOwn = () => {
    if (tenantStorageKey("locations", getCtx()) === scope) assignedQueue.flush();
  };
  flushOwn();
  const id = setInterval(flushOwn, intervalMs);
  return () => clearInterval(id);
}
