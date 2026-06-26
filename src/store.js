// ============================================================
// Doorline data store
// DEMO mode: state lives in localStorage so the app fully works in a
// browser with no backend, and the rep + admin sides share the same data.
// Live mode (Supabase keys present): the same actions write through to
// Supabase. The component layer never changes.
// ============================================================
import { useSyncExternalStore } from "react";
import { supabase, DEMO } from "./supabaseClient";

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
        addr: (100 + i * 12) + " " + streets[i % streets.length], status: st, notes: "", contact: "", phone: "", due: "" };
      homes.push(h);
      if (st === "sold") {
        const val = 8000 + Math.floor(Math.random() * 20) * 1000;
        const d = { id: uid(), repId: r.id, homeId: h.id, customer: "Customer " + (deals.length + 1), product: PRODUCTS[0], value: val, addr: h.addr };
        h.deal = d; deals.push(d);
      }
    }
  });
  return { users, homes, deals, sessionId: null };
}

// ---------- state + subscription ----------
function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
let state = load() || seed();
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
  state.users.push({ id: uid(), name, email, pass: pass || "rep", role, status: "active", plan: free ? 0 : plan, territory });
  emit(); push("profiles"); return {};
}
export function updateUser(id, patch) {
  const u = state.users.find(x => x.id === id); if (!u) return;
  if (patch.role) { const free = ["admin", "owner", "viewer"].includes(patch.role); if (free) patch.plan = 0; }
  Object.assign(u, patch); emit(); push("profiles");
}
export function removeUser(id) { state.users = state.users.filter(u => u.id !== id); emit(); push("profiles"); }
export function toggleStatus(id) { const u = state.users.find(x => x.id === id); if (u) { u.status = u.status === "active" ? "deactivated" : "active"; emit(); push("profiles"); } }

// ---------- doors / dispositions ----------
export function addHome({ repId, lat, lng, addr }) {
  const h = { id: uid(), repId, lat, lng, addr: addr || `Door @ ${lat.toFixed(5)}, ${lng.toFixed(5)}`, status: "untouched", notes: "", contact: "", phone: "", due: "" };
  state.homes.push(h); emit(); push("homes"); return h;
}
export function setDoor(id, fields) {
  const h = state.homes.find(x => x.id === id); if (!h) return;
  Object.assign(h, fields);
  if (fields.status === "sold" && fields.deal) {
    const d = { id: uid(), repId: h.repId, homeId: h.id, customer: fields.deal.customer || "New customer", product: fields.deal.product, value: fields.deal.value || 0, addr: h.addr };
    h.deal = d; state.deals.push(d); push("deals");
  }
  emit(); push("homes");
}

export function resetDemo() { localStorage.removeItem(KEY); state = seed(); emit(); }

// ---------- live write-through (no-op in DEMO) ----------
async function push(table) {
  if (DEMO || !supabase) return;
  try {
    // Best-effort sync. In production each action maps to a specific
    // insert/update; this is the hook point. See supabase/schema.sql.
    // Example: await supabase.from(table).upsert(rowFromState());
  } catch (e) { /* swallow in prototype */ }
}
