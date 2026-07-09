// ============================================================
// Write-through dispatcher used by the store. Optimistic local
// state is the source of truth for the UI; these calls push the
// same change to Supabase. No-op in demo. Failures are swallowed
// (best-effort) — the offline queue / realtime reconcile later.
// ============================================================
import { DEMO, supabase } from "../supabaseClient";
import * as S from "./services";
import { createLocationQueue } from "./locationQueue";

const live = () => !DEMO && !!supabase;
const safe = (p) => { try { Promise.resolve(p).catch(() => {}); } catch { /* ignore */ } };

export function up(table, e) {
  if (!live() || !e) return;
  if (table === "homes") safe(S.upsertHome(e));
  else if (table === "deals") safe(S.upsertDeal(e));
  else if (table === "profiles") safe(S.upsertProfile(e));
  else if (table === "posts") safe(S.upsertPost(e));
  else if (table === "territories") safe(S.upsertTerritory(e));
  else if (table === "street_rows") safe(S.upsertStreetRow(e));
  else if (table === "organizations") safe(S.upsertOrg(e));
}
export function del(table, id) {
  if (!live()) return;
  if (table === "profiles") safe(S.deleteProfile(id));
  else if (table === "posts") safe(S.deletePost(id));
  else if (table === "territories") safe(S.deleteTerritory(id));
  else if (table === "street_rows") safe(S.deleteStreetRow(id));
  else if (table === "deals") safe(S.deleteDeal(id));
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
