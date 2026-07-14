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

const live = () => !DEMO && !!supabase;

const HANDLERS = {
  homes: { upsert: S.upsertHome, del: () => {} }, // homes are never hard-deleted client-side
  deals: { upsert: S.upsertDeal, del: S.deleteDeal },
  profiles: { upsert: S.upsertProfile, del: S.deleteProfile },
  posts: { upsert: S.upsertPost, del: S.deletePost },
  territories: { upsert: S.upsertTerritory, del: S.deleteTerritory },
  street_rows: { upsert: S.upsertStreetRow, del: S.deleteStreetRow },
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
function wq() { if (!writeQueue) writeQueue = createWriteQueue({ handlers: HANDLERS }); return writeQueue; }

export function up(table, e) {
  if (!live() || !e || !HANDLERS[table]) return;
  wq().enqueue(table, "upsert", e);
  wq().flush();
}
export function del(table, id) {
  if (!live() || !HANDLERS[table]) return;
  wq().enqueue(table, "delete", id);
  wq().flush();
}
// Pending (not-yet-synced) write count, for a visible sync-status indicator.
export function pendingWrites() { return wq().size(); }
export function subscribeWrites(fn) { return wq().subscribe(fn); }
export function startWriteFlush(intervalMs = 10000) {
  if (!live()) return () => {};
  wq().flush();
  const id = setInterval(() => wq().flush(), intervalMs);
  const onOnline = () => wq().flush();
  window.addEventListener("online", onOnline);
  return () => { clearInterval(id); window.removeEventListener("online", onOnline); };
}
// Not fire-and-forget: the caller needs the result (temp password / error).
export async function createTeamMember(payload) {
  if (!live()) return { error: "not_live" };
  try { return await S.createTeamMember(payload); }
  catch { return { error: "Could not reach the server. Check your connection and try again." }; }
}

export const activity = (homeId, type) => { if (live()) safe(S.recordActivity(homeId, type)); };
export const consent = (granted) => { if (live()) safe(S.setConsentRpc(granted)); };
export const assignTerritory = (tid, repId) => { if (live()) safe(S.assignTerritory(tid, repId)); };

// ---- GPS firehose (client) ----
let queue = null;
async function sendBatch(points) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${url}/functions/v1/ingest-locations`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${data?.session?.access_token}` },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error("ingest_failed");
  return res.json();
}
function q() { if (!queue) queue = createLocationQueue({ send: sendBatch }); return queue; }

export function location(pt) { if (live()) q().enqueue(pt); }
export function startLocationFlush(intervalMs = 15000) {
  if (!live()) return () => {};
  const id = setInterval(() => q().flush(), intervalMs);
  return () => clearInterval(id);
}
