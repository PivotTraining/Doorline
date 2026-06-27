// ============================================================
// Doorline data store
// DEMO mode: state lives in localStorage so the app fully works in a
// browser with no backend, and the rep + admin sides share the same data.
// Live mode (Supabase keys present): the same actions write through to
// Supabase. The component layer never changes.
// ============================================================
import { useSyncExternalStore } from "react";
import { supabase, DEMO } from "./supabaseClient";
import * as sync from "./api/sync";
import * as M from "./api/mappers";

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

// ---------- seed (demo) ----------
function seed() {
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
        const d = { id: uid(), repId: r.id, homeId: h.id, customer: "Customer " + (deals.length + 1), product: PRODUCTS[0], value: val, addr: h.addr };
        h.deal = d; deals.push(d);
      }
    }
  });

  // company / org branding (logo is customizable by admins)
  const org = { name: "Doorline", logo: null };

  // bulletin board — admins broadcast to the whole team
  const owner = users.find((u) => u.role === "owner");
  const now = Date.now();
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
    assignedTo: r.id, start: new Date(now).toISOString().slice(0, 10),
    end: new Date(now + 5 * day).toISOString().slice(0, 10), notes: "",
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

  return { org, users, homes, deals, posts, territories, tracks, presence, sessionId: null };
}

// Fill in fields that older persisted state won't have (forward migration).
function hydrate(s) {
  if (!s) return null;
  s.org = s.org || { name: "Doorline", logo: null };
  s.posts = s.posts || [];
  s.territories = s.territories || [];
  s.tracks = s.tracks || {};
  s.presence = s.presence || {};
  s.homes = (s.homes || []).map((h) => ({ activity: [], ...h }));
  return s;
}

// ---------- state + subscription ----------
function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
let state = hydrate(load()) || seed();
let version = 0;
const listeners = new Set();
function emit() { version++; localStorage.setItem(KEY, JSON.stringify(state)); listeners.forEach(l => l()); }

export function getState() { return state; }
export function getSnapshot() { return version; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function useStore() { useSyncExternalStore(subscribe, getSnapshot); return state; }

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
    const d = { id: uid(), repId: h.repId, homeId: h.id, customer: fields.deal.customer || "New customer", product: fields.deal.product, value: fields.deal.value || 0, addr: h.addr };
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
export function addTerritory(t) { const nt = { id: uid(), color: "#2e90fa", notes: "", ...t }; state.territories.push(nt); emit(); push("territories", nt); }
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
// Merge a Realtime change into local state.
export function applyRemote(table, payload) {
  const row = payload.new, old = payload.old, ev = payload.eventType;
  if (table === "homes" && row) {
    const h = M.homeFromRow(row);
    const i = state.homes.findIndex((x) => x.id === h.id);
    if (i >= 0) state.homes[i] = { ...state.homes[i], ...h }; else state.homes.push(h);
  } else if (table === "deals" && row) {
    const d = M.dealFromRow(row);
    if (!state.deals.some((x) => x.id === d.id)) state.deals.push(d);
  } else if (table === "posts") {
    if (ev === "DELETE") state.posts = state.posts.filter((p) => p.id !== old?.id);
    else if (row) {
      const p = M.postFromRow(row);
      const i = state.posts.findIndex((x) => x.id === p.id);
      if (i >= 0) state.posts[i] = p; else state.posts.unshift(p);
    }
  }
  emit();
}
