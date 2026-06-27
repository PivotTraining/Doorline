// ============================================================
// Live-mode bootstrap: after a Supabase session exists, load the
// org snapshot into the store and subscribe to Realtime. No-op in demo.
// ============================================================
import { DEMO } from "../supabaseClient";
import * as auth from "./auth";
import * as S from "./services";
import { subscribeOrg } from "./realtime";
import { setCtx } from "./context";
import { startLocationFlush } from "./sync";
import { loadSnapshot, applyRemote } from "../store";

let unsub = null;
let stopFlush = null;

export async function initLive() {
  if (DEMO) return null;
  const profile = await auth.myProfile();
  if (!profile) return null;                 // not signed in yet
  setCtx({ orgId: profile.org_id, repId: profile.id });
  const snap = await S.loadAll();
  loadSnapshot(snap, profile.id);
  if (unsub) unsub();
  unsub = subscribeOrg(profile.org_id, applyRemote);
  if (stopFlush) stopFlush();
  stopFlush = startLocationFlush();          // drain the GPS queue on an interval
  return profile;
}

export function teardownLive() {
  if (unsub) { unsub(); unsub = null; }
  if (stopFlush) { stopFlush(); stopFlush = null; }
}
