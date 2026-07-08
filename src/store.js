// ============================================================
// Doorline data store
// DEMO mode: state lives in localStorage so the app fully works in a
// browser with no backend, and the rep + admin sides share the same data.
// Live mode (Supabase keys present): the same actions write through to
// Supabase. The component layer never changes.
// ============================================================
import { useSyncExternalStore, useReducer, useRef, useEffect } from "react";
import { supabase, DEMO } from "./supabaseClient";
import * as sync from "./api/sync";
import * as M from "./api/mappers";
import { localDay } from "./lib/date.js";

export { localDay };

const KEY = "doorline_state_v1";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Math.random().toString(36).slice(2));

// ---------- constants shared across the app ----------
export const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", rep: "Rep", viewer: "Viewer" };
export const PLAN_NAME = { 3900: "Starter", 5900: "Growth", 8900: "Scale", 0: "—" };
export const DISPOS = {
  untouched: { lab: "Not worked", hex: "#94a3b8" },
  nothome:   { lab: "Not home", hex: "#38bdf8" },
  callback:  { lab: "Come back", hex: "#f59e0b" },
  appt:      { lab: "Appointment", hex: "#a855f7" },
  notint:    { lab: "Not interested", hex: "#ef4444" },
  sold:      { lab: "Sold", hex: "#22c55e" },
  dnc:       { lab: "Do not contact", hex: "#64748b" },
};
export const PRODUCTS = ["Solar — Standard", "Solar — Premium", "Security System", "Internet / Telecom", "Pest Control — Annual", "Other"];
// Granular door-activity funnel reps tap as they work a door (separate from the final outcome).
export const ACTIONS = [
  { key: "knocked", lab: "Door knocked", hex: "#38bdf8" },
  { key: "contact", lab: "Contact made", hex: "#f59e0b" },
  { key: "pitch", lab: "Presentation made", hex: "#a855f7" },
  { key: "followup", lab: "Follow-up set", hex: "#14b8a6" },
];
export const ACTION_LAB = Object.fromEntries(ACTIONS.map((a) => [a.key, a]));
// Digital "Street Sheet" — the columns from the paper TTS form.
export const SHEET_COLS = [
  { key: "nh", lab: "NH", title: "Not Home" },
  { key: "rl", lab: "RL", title: "Reloop" },
  { key: "dm", lab: "DM", title: "Decision Maker" },
  { key: "bid", lab: "B/ID", title: "Bill or ID" },
  { key: "d", lab: "D", title: "Deal" },
  { key: "ni", lab: "NI", title: "Not Interested" },
];

// ---------- seed (demo) ----------
function seed() {
  const now = Date.now();
  const C = [33.749, -84.388]; // Atlanta
  const mk = (name, email, role, plan, terr) => ({ id: uid(), name, email, pass: role === "rep" ? "rep" : role === "viewer" ? "view" : "admin", role, status: "active", plan, territory: terr });
  const users = [
    mk("Chris Davis", "admin@doorline.app", "owner", 0, "—"),
    mk("Jazmine Davis", "jaz@doorline.app", "manager", 5900, "All"),
    mk("Jordan Miles", "jordan@doorline.app", "rep", 5900, "North"),
    mk("Tasha Reed", "tasha@doorline.app", "rep", 5900, "South"),
    mk("Devon Carter", "devon@doorline.app", "rep", 3900, "East"),
    mk("Investor", "viewer@doorline.app", "viewer", 0, "—"),
  ];
  const reps = users.filter(u => u.role === "rep");
  const statuses = ["untouched", "nothome", "callback", "appt", "notint", "sold"];
  const streets = ["Maple St", "Oak Ave", "Elm Dr", "Pine Ln", "Cedar Ct", "Birch Rd"];
  const homes = [], deals = [];
  reps.forEach((r, ri) => {
    for (let i = 0; i < 6; i++) {
      const lat = C[0] + (ri - 1) * 0.01 + (Math.random() - 0.5) * 0.012;
      const lng = C[1] + (Math.random() - 0.5) * 0.018;
      const st = i < 2 ? "untouched" : statuses[Math.floor(Math.random() * statuses.length)];
      const h = { id: uid(), repId: r.id, lat: +lat.toFixed(6), lng: +lng.toFixed(6),
        addr: (100 + i * 12) + " " + streets[i % streets.length], status: st, notes: "", contact: "", phone: "", due: "", activity: [] };
      homes.push(h);
      if (st === "sold") {
        const val = 8000 + Math.floor(Math.random() * 20) * 1000;
        const d = { id: uid(), repId: r.id, homeId: h.id, customer: "Customer " + (deals.length + 1), product: PRODUCTS[0], value: val, addr: h.addr, ts: now - Math.floor(Math.random() * 14) * 86400e3 };
        h.deal = d; deals.push(d);
      }
    }
  });

  // company / org branding + manager-set follow-up/nudge rules
  const org = { name: "Doorline", logo: null, followup: { enabled: true, hours: 24, onPhone: true, onCB: true, quietStart: "21:00", quietEnd: "08:00" } };

  // bulletin board — admins broadcast to the whole team
  const owner = users.find((u) => u.role === "owner");
  const posts = [
    { id: uid(), authorId: owner.id, authorName: owner.name, title: "Welcome to the team 👋",
      body: "Log every door on the map — knock, pitch, set follow-ups. Check this board for daily targets and shout-outs.",
      ts: now - 3600e3, pinned: true },
  ];

  // territory schedule (managers assign date-bounded blocks to reps)
  const day = 86400e3;
  const tColors = ["#2e90fa", "#16a34a", "#f59e0b", "#a855f7"];
  const territories = reps.map((r, i) => ({
    id: uid(), name: r.territory + " District", color: tColors[i % tColors.length],
    assignedTo: r.id, start: localDay(new Date(now)),
    end: localDay(new Date(now + 5 * day)), notes: "",
  }));

  // GPS breadcrumb trails + presence (seeded so the path view is populated in demo)
  const tracks = {}, presence = {};
  reps.forEach((r) => {
    const hs = homes.filter((h) => h.repId === r.id);
    let [la, ln] = hs[0] ? [hs[0].lat, hs[0].lng] : C;
    const pts = [];
    for (let k = 0; k < 16; k++) {
      la += (Math.random() - 0.5) * 0.0016; ln += (Math.random() - 0.5) * 0.0016;
      pts.push({ lat: +la.toFixed(6), lng: +ln.toFixed(6), ts: now - (16 - k) * 10 * 60e3 });
    }
    tracks[r.id] = pts;
    presence[r.id] = { online: false, since: null, consent: undefined };
  });

  // street sheet — seed one rep's sheet so the grid/rollup is populated
  const day0 = localDay(new Date(now));
  const r0 = reps[0];
  const mkRow = (street, f = {}, customer = "", comments = "", cb = "", phone = "") =>
    ({ id: uid(), repId: r0.id, date: day0, street, nh: false, rl: false, dm: false, bid: false, d: false, ni: false, customer, comments, cb, phone, createdAt: now - 26 * 3600e3, done: false, snoozeUntil: 0, dealId: null, ...f });
  const streetRows = [
    mkRow("580 Noah Ave", { nh: true }),
    mkRow("576 Noah Ave", { nh: true }),
    mkRow("570 Noah Ave", { ni: true }, "", "Slammed door"),
    mkRow("566 Noah Ave", { dm: true, bid: true }, "Sergio", "Got bill, wants a call back", "", "(404) 555-0142"),
    mkRow("562 Noah Ave", { nh: true }),
    mkRow("540 Noah Ave", { dm: true, d: true }, "Balcony", "PIPP — closed"),
    mkRow("509 Noah Ave", { rl: true }, "Maria", "Come back later", "5:30", "(404) 555-0188"),
  ].map((r, i) => ({ ...r, slot: i + 1 }));

  // street-sheet "D" rows create a deal so My Deals reflects them
  streetRows.filter((r) => r.d).forEach((r) => {
    const dl = { id: uid(), repId: r.repId, homeId: null, customer: r.customer || "New customer", product: PRODUCTS[0], value: 12000, addr: r.street, ts: now };
    r.dealId = dl.id; deals.push(dl);
  });

  return { org, users, homes, deals, posts, territories, tracks, presence, streetRows, submittedDays: {}, sessionId: null };
}

// Fill in fields that older persisted state won't have (forward migration).
function hydrate(s) {
  if (!s) return null;
  s.org = s.org || { name: "Doorline", logo: null };
  s.org.followup = s.org.followup || { enabled: true, hours: 24, onPhone: true, onCB: true, quietStart: "21:00", quietEnd: "08:00" };
  s.posts = s.posts || [];
  s.territories = s.territories || [];
  s.tracks = s.tracks || {};
  s.presence = s.presence || {};
  s.streetRows = (s.streetRows || []).map((r) => ({ phone: "", done: false, snoozeUntil: 0, dealId: null, createdAt: Date.now(), ...r }));
  s.submittedDays = s.submittedDays || {};
  s.homes = (s.homes || []).map((h) => ({ activity: [], ...h }));
  s.deals = (s.deals || []).map((d) => ({ ts: Date.now(), ...d }));
  return s;
}

// ---------- state + subscription ----------
function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
let state = hydrate(load()) || seed();
let version = 0;
const listeners = new Set();

// Persistence is decoupled from notification: JSON.stringify + localStorage is
// the expensive part, so we coalesce many mutations into a single idle-time
// write instead of serializing the whole store on every keystroke/breadcrumb.
let persistScheduled = false;
const idle = typeof requestIdleCallback === "function"
  ? (fn) => requestIdleCallback(fn, { timeout: 1000 })
  : (fn) => setTimeout(fn, 250);
function persistNow() {
  persistScheduled = false;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota/serialization */ }
}
function schedulePersist() { if (!persistScheduled) { persistScheduled = true; idle(persistNow); } }
if (typeof window !== "undefined") {
  const flush = () => { if (persistScheduled) persistNow(); };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

  // Cross-tab sync (demo/local-storage mode): the browser only fires
  // "storage" in *other* tabs, never the one that wrote — so when a manager
  // and a rep have the app open in two tabs on the same machine, the
  // manager's tab picks up the rep's changes without a manual reload.
  // Skipped if this tab has its own unsaved edits pending, so we never
  // clobber local work with a stale snapshot from another tab.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || e.newValue == null || persistScheduled) return;
    try {
      const incoming = hydrate(JSON.parse(e.newValue));
      // Adopt the other tab's data, but never its session — each tab is
      // signed in independently (its own demo user or its own Supabase
      // Auth session), so swapping sessionId here would log this tab in/out
      // as whoever last wrote from the other tab.
      if (incoming) { state = { ...incoming, sessionId: state.sessionId }; version++; listeners.forEach((l) => l()); }
    } catch { /* ignore corrupt payloads */ }
  });
}

function emit() { version++; schedulePersist(); listeners.forEach((l) => l()); }

export function getState() { return state; }
export function getSnapshot() { return version; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function useStore() { useSyncExternalStore(subscribe, getSnapshot); return state; }

// Granular subscription: re-render only when selector(state) changes by isEqual.
// Lets the shell/nav opt out of the firehose of data mutations.
export function useSelector(selector, isEqual = Object.is) {
  const [, force] = useReducer((c) => (c + 1) | 0, 0);
  const selRef = useRef(selector); selRef.current = selector;
  const valRef = useRef();
  valRef.current = selector(state);
  useEffect(() => {
    let prev = valRef.current;
    const check = () => {
      const next = selRef.current(state);
      if (!isEqual(prev, next)) { prev = next; valRef.current = next; force(); }
    };
    const unsub = subscribe(check);
    check(); // catch changes between render and effect
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return valRef.current;
}

// ---------- selectors ----------
export function currentUser() { return state.users.find(u => u.id === state.sessionId) || null; }
export function isAdmin(u = currentUser()) { return u && (u.role === "owner" || u.role === "admin"); }
export function repStats(repId) {
  const hs = state.homes.filter(h => h.repId === repId && h.status !== "untouched");
  const s = { knocks: hs.length, contacts: 0, appts: 0, closes: 0 };
  hs.forEach(h => {
    if (["callback", "appt", "notint", "sold", "dnc"].includes(h.status)) s.contacts++;
    if (h.status === "appt") s.appts++;
    if (h.status === "sold") s.closes++;
  });
  s.rate = s.contacts ? Math.round((s.closes / s.contacts) * 100) : 0;
  return s;
}

// ---------- auth ----------
export function login(email, pass) {
  const u = state.users.find(x => x.email.toLowerCase() === email.toLowerCase() && x.pass === pass);
  if (!u) return { error: "Incorrect email or password." };
  if (u.status !== "active") return { error: "This account is deactivated." };
  state.sessionId = u.id; emit();
  return { user: u };
}
export function logout() { state.sessionId = null; emit(); }

// ---------- personnel ----------
export function addUser({ name, email, role, plan, territory, pass }) {
  if (state.users.some(u => u.email.toLowerCase() === email.toLowerCase())) return { error: "Email already in use" };
  const free = role === "admin" || role === "owner" || role === "viewer";
  const u = { id: uid(), name, email, pass: pass || "rep", role, status: "active", plan: free ? 0 : plan, territory };
  state.users.push(u);
  emit(); push("profiles", u); return {};
}
export function updateUser(id, patch) {
  const u = state.users.find(x => x.id === id); if (!u) return;
  if (patch.role) { const free = ["admin", "owner", "viewer"].includes(patch.role); if (free) patch.plan = 0; }
  Object.assign(u, patch); emit(); push("profiles", u);
}
export function removeUser(id) { state.users = state.users.filter(u => u.id !== id); emit(); pushDel("profiles", id); }
export function toggleStatus(id) { const u = state.users.find(x => x.id === id); if (u) { u.status = u.status === "active" ? "deactivated" : "active"; emit(); push("profiles", u); } }

// ---------- doors / dispositions ----------
export function addHome({ repId, lat, lng, addr }) {
  const h = { id: uid(), repId, lat, lng, addr: addr || `Door @ ${lat.toFixed(5)}, ${lng.toFixed(5)}`, status: "untouched", notes: "", contact: "", phone: "", due: "", activity: [] };
  state.homes.push(h); emit(); push("homes", h); return h;
}
export function setDoor(id, fields) {
  const h = state.homes.find(x => x.id === id); if (!h) return;
  Object.assign(h, fields);
  if (fields.status === "sold" && fields.deal) {
    const d = { id: uid(), repId: h.repId, homeId: h.id, customer: fields.deal.customer || "New customer", product: fields.deal.product, value: fields.deal.value || 0, addr: h.addr, ts: Date.now() };
    h.deal = d; state.deals.push(d); push("deals", d);
  }
  emit(); push("homes", h);
}

// ---------- org / branding ----------
export function setOrg(patch) { Object.assign(state.org, patch); emit(); push("organizations", state.org); }

// ---------- bulletin board ----------
export function addPost({ authorId, authorName, title, body }) {
  const post = { id: uid(), authorId, authorName, title, body, ts: Date.now(), pinned: false };
  state.posts.unshift(post);
  emit(); push("posts", post);
}
export function removePost(id) { state.posts = state.posts.filter((p) => p.id !== id); emit(); pushDel("posts", id); }
export function togglePin(id) { const p = state.posts.find((x) => x.id === id); if (p) { p.pinned = !p.pinned; emit(); push("posts", p); } }

// ---------- territories (manager scheduling) ----------
export function addTerritory(t) { const nt = { id: uid(), color: "#2e90fa", notes: "", ...t }; state.territories.push(nt); emit(); push("territories", nt); return nt; }
export function updateTerritory(id, patch) { const t = state.territories.find((x) => x.id === id); if (t) { Object.assign(t, patch); emit(); push("territories", t); } }
export function removeTerritory(id) { state.territories = state.territories.filter((t) => t.id !== id); emit(); pushDel("territories", id); }

// ---------- door activity funnel ----------
export function logActivity(homeId, type) {
  const h = state.homes.find((x) => x.id === homeId); if (!h) return;
  (h.activity = h.activity || []).push({ type, ts: Date.now() });
  emit(); sync.activity(homeId, type);
}

// ---------- GPS tracking + presence + consent ----------
export function setConsent(repId, consent) {
  const p = (state.presence[repId] = state.presence[repId] || {});
  p.consent = consent; emit(); sync.consent(consent === "granted");
}
export function startSession(repId) {
  const p = (state.presence[repId] = state.presence[repId] || {});
  p.online = true; p.since = Date.now(); emit();
}
export function endSession(repId) {
  const p = state.presence[repId]; if (p) { p.online = false; emit(); }
}
export function addBreadcrumb(repId, pt) {
  const arr = (state.tracks[repId] = state.tracks[repId] || []);
  arr.push({ lat: +pt.lat.toFixed(6), lng: +pt.lng.toFixed(6), ts: Date.now() });
  if (arr.length > 600) arr.splice(0, arr.length - 600);
  emit(); sync.location({ lat: pt.lat, lng: pt.lng });
}
export function clearTrack(repId) { state.tracks[repId] = []; emit(); }

// Accountability: minutes online vs. doors actually worked this session.
export function repAccountability(repId) {
  const t = state.tracks[repId] || [];
  const p = state.presence[repId] || {};
  let mins = 0;
  if (p.online && p.since) mins = Math.round((Date.now() - p.since) / 60000);
  else if (t.length > 1) mins = Math.round((t[t.length - 1].ts - t[0].ts) / 60000);
  const doors = state.homes.filter((h) => h.repId === repId && (h.status !== "untouched" || (h.activity && h.activity.length))).length;
  return { mins, doors, points: t.length, online: !!p.online, consent: p.consent };
}

// ---------- street sheet ----------
export function addStreetRow({ repId, date, ...init }) {
  const r = { id: uid(), repId, date, street: "", nh: false, rl: false, dm: false, bid: false, d: false, ni: false, customer: "", comments: "", cb: "", phone: "", createdAt: Date.now(), done: false, snoozeUntil: 0, dealId: null, ...init };
  state.streetRows.push(r);
  if (r.d) linkStreetDeal(r); // created already marked sold
  emit(); push("street_rows", r); return r;
}
// Marking "D" on a street row creates a deal (shows in My Deals); clearing it removes the deal.
function linkStreetDeal(r) {
  if (r.dealId) return;
  const d = { id: uid(), repId: r.repId, homeId: null, customer: r.customer || "New customer", product: PRODUCTS[0], value: 0, addr: r.street || "", ts: Date.now() };
  r.dealId = d.id; state.deals.push(d); push("deals", d);
}
function unlinkStreetDeal(r) {
  if (!r.dealId) return;
  const id = r.dealId; r.dealId = null;
  state.deals = state.deals.filter((x) => x.id !== id); pushDel("deals", id);
}
export function updateStreetRow(id, patch) {
  const r = state.streetRows.find((x) => x.id === id); if (!r) return;
  if (patch.d === true && !r.dealId) { Object.assign(r, patch); linkStreetDeal(r); }
  else if (patch.d === false && r.dealId) { Object.assign(r, patch); unlinkStreetDeal(r); }
  else Object.assign(r, patch);
  // keep the linked deal's customer in sync
  if (r.dealId && patch.customer != null) { const d = state.deals.find((x) => x.id === r.dealId); if (d) { d.customer = patch.customer || "New customer"; push("deals", d); } }
  emit(); push("street_rows", r);
}
export function updateDeal(id, patch) { const d = state.deals.find((x) => x.id === id); if (d) { Object.assign(d, patch); emit(); push("deals", d); } }

// ---------- daily sheet lifecycle ----------
const dayKey = (repId, date) => repId + "|" + date;
export function submitDay(repId, date) { state.submittedDays[dayKey(repId, date)] = true; emit(); }
export function reopenDay(repId, date) { delete state.submittedDays[dayKey(repId, date)]; emit(); }
export function isDaySubmitted(repId, date) { return !!state.submittedDays[dayKey(repId, date)]; }

// Combined stats for My Day: map doors + street-sheet work.
export function dayStats(repId) {
  const s = repStats(repId);
  const rows = state.streetRows.filter((r) => r.repId === repId);
  const worked = rows.filter((r) => r.nh || r.rl || r.dm || r.bid || r.d || r.ni || r.street).length;
  const dm = rows.filter((r) => r.dm).length;
  const sold = rows.filter((r) => r.d).length;
  const contacts = s.contacts + dm;
  const closes = s.closes + sold;
  return { knocks: s.knocks + worked, contacts, appts: s.appts, closes, rate: contacts ? Math.round((closes / contacts) * 100) : 0 };
}
export function removeStreetRow(id) {
  const r = state.streetRows.find((x) => x.id === id);
  if (r && r.dealId) { const did = r.dealId; state.deals = state.deals.filter((x) => x.id !== did); pushDel("deals", did); }
  state.streetRows = state.streetRows.filter((x) => x.id !== id); emit(); pushDel("street_rows", id);
}

// ---------- follow-up nudges ----------
// Manager-set rules (org-level; applies to the team's reps).
export function setFollowupSettings(patch) {
  state.org.followup = { ...(state.org.followup || {}), ...patch };
  emit(); push("organizations", state.org);
}
export function resolveNudge(rowId) { const r = state.streetRows.find((x) => x.id === rowId); if (r) { r.done = true; emit(); push("street_rows", r); } }
export function snoozeNudge(rowId, ms) { const r = state.streetRows.find((x) => x.id === rowId); if (r) { r.snoozeUntil = Date.now() + ms; emit(); push("street_rows", r); } }

// Follow-ups that are due for a rep right now, from the tracking sheet
// (a captured phone, not yet closed/uninterested) and door call-backs.
export function dueNudges(repId) {
  const fu = state.org.followup || {};
  if (fu.enabled === false) return [];
  const now = Date.now();
  const wait = (fu.hours ?? 24) * 3600e3;
  const out = [];
  if (fu.onPhone !== false) {
    state.streetRows
      .filter((r) => r.repId === repId && r.phone && !r.d && !r.ni && !r.done)
      .forEach((r) => {
        const due = Math.max((r.createdAt || now) + wait, r.snoozeUntil || 0);
        if (now >= due) out.push({ id: r.id, source: "street", label: r.customer || r.street || "Door", sub: r.street, phone: r.phone, due });
      });
  }
  const todayLocal = localDay();
  state.homes
    .filter((h) => h.repId === repId && ["callback", "appt"].includes(h.status) && h.phone && h.due && h.due <= todayLocal)
    .forEach((h) => out.push({ id: h.id, source: "door", label: h.contact || h.addr, sub: h.addr, phone: h.phone, due: Date.parse(h.due) || now }));
  return out.sort((a, b) => a.due - b.due);
}

// Tally the six columns (+ CB and total doors) for a set of rows.
export function sheetTotals(rows) {
  const t = { doors: rows.length, nh: 0, rl: 0, dm: 0, bid: 0, d: 0, ni: 0, cb: 0 };
  rows.forEach((r) => {
    SHEET_COLS.forEach((c) => { if (r[c.key]) t[c.key]++; });
    if (r.cb) t.cb++;
  });
  return t;
}
// Office rollup: per-rep + grand totals (optionally for one date).
export function officeRollup(date) {
  const rows = date ? state.streetRows.filter((r) => r.date === date) : state.streetRows;
  const reps = state.users.filter((u) => u.role === "rep");
  const perRep = reps.map((rep) => ({ rep, ...sheetTotals(rows.filter((r) => r.repId === rep.id)) }));
  const grand = sheetTotals(rows);
  return { perRep, grand };
}

export function resetDemo() { localStorage.removeItem(KEY); state = seed(); emit(); }

// ---------- live write-through (no-op in DEMO) ----------
// Delegates to the production data layer (src/api/sync.js), which is a
// no-op unless Supabase keys are present. The component layer never changes.
function push(table, entity) { sync.up(table, entity); }
function pushDel(table, id) { sync.del(table, id); }

// ---------- live hydration + realtime (live mode only) ----------
// Replace local slices with a server snapshot (api/bootstrap.initLive()).
export function loadSnapshot(snap, sessionId) {
  state = { ...state, ...snap, sessionId: sessionId ?? state.sessionId };
  state.tracks = state.tracks || {};
  state.presence = state.presence || {};
  emit();
}
// Merge a Realtime change into local state. Runs for every subscribed table
// (see src/api/realtime.js) so any manager/rep screen reading that slice of
// state repaints live — no manual reload needed.
export function applyRemote(table, payload) {
  const row = payload.new, old = payload.old, ev = payload.eventType;
  const upsert = (list, item, unshift) => {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = { ...list[i], ...item }; else unshift ? list.unshift(item) : list.push(item);
  };
  if (table === "homes" && row) {
    upsert(state.homes, M.homeFromRow(row));
  } else if (table === "deals") {
    if (ev === "DELETE") state.deals = state.deals.filter((d) => d.id !== old?.id);
    else if (row) upsert(state.deals, M.dealFromRow(row));
  } else if (table === "posts") {
    if (ev === "DELETE") state.posts = state.posts.filter((p) => p.id !== old?.id);
    else if (row) upsert(state.posts, M.postFromRow(row), true);
  } else if (table === "street_rows") {
    if (ev === "DELETE") state.streetRows = state.streetRows.filter((r) => r.id !== old?.id);
    else if (row) upsert(state.streetRows, M.streetRowFromRow(row));
  } else if (table === "territories") {
    if (ev === "DELETE") state.territories = state.territories.filter((t) => t.id !== old?.id);
    else if (row) upsert(state.territories, M.territoryFromRow(row));
  }
  emit();
}
