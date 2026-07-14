// ============================================================
// Live-mode bootstrap: after a Supabase session exists, load the
// org snapshot into the store and subscribe to Realtime. No-op in demo.
// ============================================================
import { DEMO } from "../supabaseClient";
import * as auth from "./auth";
import * as S from "./services";
import { subscribeOrg } from "./realtime";
import { setCtx } from "./context";
import { startLocationFlush, startWriteFlush } from "./sync";
import { loadSnapshot, applyRemote } from "../store";

let unsub = null;
let stopFlush = null;
let stopWriteFlush = null;
let activeProfile = null;
let stopResync = null;

// Pull a fresh org snapshot into the store. Realtime keeps us live while the
// socket is up, but mobile browsers silently drop the WebSocket when the tab
// is backgrounded or the network flaps — so on the way back we re-pull to
// catch anything the socket missed. Throttled so a burst of focus/online
// events can't hammer the API.
let lastResync = 0;
let resyncing = false;
async function resync() {
  if (!activeProfile) return;
  const now = Date.now();
  if (resyncing || now - lastResync < 15000) return;
  resyncing = true;
  lastResync = now;
  try {
    const snap = await S.loadAll();
    loadSnapshot(snap, activeProfile.id);
    const reports = await S.loadReports();
    if (reports) loadSnapshot(reports, activeProfile.id);
  } catch {
    // A failed resync is non-fatal — the live socket and write queue carry on.
  } finally {
    resyncing = false;
  }
}

function startResync() {
  const onVisible = () => { if (document.visibilityState === "visible") resync(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", resync);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", resync);
  };
}

export async function initLive() {
  if (DEMO) return null;
  const profile = await auth.myProfile();
  if (!profile) return null;                 // not signed in yet
  activeProfile = profile;
  setCtx({ orgId: profile.org_id, repId: profile.id });
  const snap = await S.loadAll();
  loadSnapshot(snap, profile.id);
  // Reports load separately + best-effort: a missing report table must not
  // stop the app from booting.
  const reports = await S.loadReports();
  if (reports) loadSnapshot(reports, profile.id);
  lastResync = Date.now();                    // fresh snapshot — don't immediately re-pull
  if (unsub) unsub();
  unsub = subscribeOrg(profile.org_id, applyRemote);
  if (stopFlush) stopFlush();
  stopFlush = startLocationFlush();          // drain the GPS queue on an interval
  if (stopWriteFlush) stopWriteFlush();
  stopWriteFlush = startWriteFlush();        // retry any queued homes/deals/street-sheet writes
  if (stopResync) stopResync();
  stopResync = startResync();                // re-pull a snapshot on tab-focus / reconnect
  return profile;
}

export function teardownLive() {
  if (unsub) { unsub(); unsub = null; }
  if (stopFlush) { stopFlush(); stopFlush = null; }
  if (stopWriteFlush) { stopWriteFlush(); stopWriteFlush = null; }
  if (stopResync) { stopResync(); stopResync = null; }
  activeProfile = null;
}
