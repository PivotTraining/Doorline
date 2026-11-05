import { useState, useEffect, lazy, Suspense } from "react";
import { getState, currentUser, useSelector, logout, ROLE_LABEL, resetDemo } from "./store";
import { DEMO } from "./supabaseClient";
import { initLive } from "./api/bootstrap";
import { pendingWrites, subscribeWrites } from "./api/sync";
import { useTheme, toggleTheme } from "./theme.js";
import RepTracker from "./components/RepTracker.jsx";
import NudgeBell from "./components/NudgeBell.jsx";
import Logo from "./components/Logo.jsx";

import Login from "./pages/Login.jsx";
import Landing from "./pages/Landing.jsx";
import Home from "./pages/Home.jsx";
import Bulletin from "./pages/Bulletin.jsx";
// rep (light pages: static import)
import MyDay from "./pages/rep/MyDay.jsx";
import StreetSheet from "./pages/rep/StreetSheet.jsx";
import FollowUps from "./pages/rep/FollowUps.jsx";
import MyDeals from "./pages/rep/MyDeals.jsx";
import Leaderboard from "./pages/rep/Leaderboard.jsx";
import Profile from "./pages/rep/Profile.jsx";
import RepCampaigns from "./pages/rep/Campaigns.jsx";
import MyReports from "./pages/rep/MyReports.jsx";
// admin (light)
import Personnel from "./pages/admin/Personnel.jsx";
import TeamStats from "./pages/admin/TeamStats.jsx";
import Campaigns from "./pages/admin/Campaigns.jsx";
import Reports from "./pages/admin/Reports.jsx";
import DailyCloseouts from "./pages/admin/DailyCloseouts.jsx";
import Commissions from "./pages/admin/Commissions.jsx";
import Billing from "./pages/admin/Billing.jsx";
import Settings from "./pages/admin/Settings.jsx";

// Map-heavy pages pull in Leaflet — code-split so login + non-map views
// don't pay for ~150KB of mapping libs up front.
const Doors = lazy(() => import("./pages/rep/Doors.jsx"));
const Territories = lazy(() => import("./pages/admin/Territories.jsx"));

const REP_NAV = [
  { id: "home", label: "Home", ico: "🏠", el: Home },
  { id: "myday", label: "My Day", ico: "☀️", el: MyDay },
  { id: "doors", label: "Map / Doors", ico: "📍", el: Doors },
  { id: "streetsheet", label: "Street Sheet", ico: "📝", el: StreetSheet },
  { id: "campaigns", label: "Campaigns", ico: "🎯", el: RepCampaigns },
  { id: "followups", label: "Follow-ups", ico: "🔁", el: FollowUps },
  { id: "mydeals", label: "My Deals", ico: "💰", el: MyDeals },
  { id: "myreports", label: "My Reports", ico: "📄", el: MyReports },
  { id: "leaderboard", label: "Leaderboard", ico: "🏆", el: Leaderboard },
  { id: "bulletin", label: "Bulletin", ico: "📣", el: Bulletin },
  { id: "profile", label: "Profile", ico: "👤", el: Profile },
];
const ADMIN_NAV = [
  { id: "home", label: "Home", ico: "🏠", el: Home },
  { id: "personnel", label: "Personnel", ico: "👥", el: Personnel },
  { id: "teamstats", label: "Team Stats", ico: "📊", el: TeamStats },
  { id: "territories", label: "Territories", ico: "🧭", el: Territories },
  { id: "campaigns", label: "Campaigns", ico: "🎯", el: Campaigns },
  { id: "reports", label: "Reports", ico: "📄", el: Reports },
  { id: "closeouts", label: "Daily Closeouts", ico: "✅", el: DailyCloseouts },
  { id: "commissions", label: "Commissions", ico: "💵", el: Commissions },
  { id: "bulletin", label: "Bulletin", ico: "📣", el: Bulletin },
  { id: "billing", label: "Billing", ico: "🧾", el: Billing },
  { id: "settings", label: "Settings", ico: "⚙️", el: Settings },
];

// Remember each user's last-open tab so a reload lands back where they were
// instead of snapping to the first nav item.
const TAB_KEY = "doorline_tab_v2";
function loadTab(userId, nav) {
  try {
    const saved = JSON.parse(localStorage.getItem(TAB_KEY) || "{}")[userId];
    if (saved && nav.some((n) => n.id === saved)) return saved;
  } catch {}
  return nav[0].id;
}
function saveTab(userId, tabId) {
  try {
    const all = JSON.parse(localStorage.getItem(TAB_KEY) || "{}");
    all[userId] = tabId;
    localStorage.setItem(TAB_KEY, JSON.stringify(all));
  } catch {}
}

// Minimal path router: "/" = marketing landing, "/app" = the product.
function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (to) => { if (to !== window.location.pathname) { window.history.pushState({}, "", to); setPath(to); window.scrollTo(0, 0); } };
  return [path, navigate];
}

export default function App() {
  // Only re-render the gate when the session changes — not on every data mutation.
  useSelector((s) => s.sessionId);
  useEffect(() => { if (!DEMO) initLive(); }, []);
  const [path, navigate] = useRoute();
  const user = currentUser();

  if (path.startsWith("/app")) {
    return user ? <Shell user={user} /> : <Login onBack={() => navigate("/")} />;
  }
  return <Landing onEnter={() => navigate("/app")} />;
}

// Writes that haven't made it to the server yet (e.g. a rep with patchy
// signal) are retried automatically in the background, but that needs to
// be VISIBLE — a silent retry is indistinguishable from a silent loss.
function SyncStatus() {
  const [pending, setPending] = useState(() => pendingWrites());
  useEffect(() => subscribeWrites(setPending), []);
  if (DEMO || pending === 0) return null;
  return (
    <span className="pill" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}
      title={`${pending} change${pending === 1 ? "" : "s"} haven't reached the server yet — retrying automatically, don't close the app`}>
      <span className="dot" style={{ background: "var(--amber)" }} /> Syncing {pending}…
    </span>
  );
}

function BrandMark({ size = 30 }) {
  const org = getState().org;
  return org.logo
    ? <div className="logo" style={{ width: size, height: size }}><img src={org.logo} alt="" /></div>
    : <Logo size={size} />;
}

function Shell({ user }) {
  useTheme();
  // Narrow subscriptions: the shell repaints only when branding or the
  // tracking state changes — NOT on every door/breadcrumb/keystroke.
  useSelector((s) => `${s.org.name}\0${s.org.logo || ""}`);
  const tracking = useSelector(
    (s) => user.role === "rep" && !!s.presence[user.id]?.online && s.presence[user.id]?.consent === "granted"
  );

  const nav = user.role === "rep" ? REP_NAV : ADMIN_NAV;
  const [tab, setTabState] = useState(() => loadTab(user.id, nav));
  const setTab = (id) => { setTabState(id); saveTab(user.id, id); };
  const active = nav.find((n) => n.id === tab) || nav[0];
  const Page = active.el;
  const org = getState().org;

  return (
    <div className="shell">
      {user.role === "rep" && <RepTracker user={user} />}
      <aside className="side">
        <div className="brand">
          <BrandMark />
          <b>{org.name || "Doorline"}</b>
        </div>
        <div className="nav-label">{user.role === "rep" ? "Field" : "Admin"}</div>
        {nav.map((n) => (
          <div key={n.id} className={"nav-item" + (n.id === tab ? " active" : "")} onClick={() => setTab(n.id)}>
            <span className="ico">{n.ico}</span> {n.label}
          </div>
        ))}
        <div className="spacer" />
        <div className="who">
          <div className="name">{user.name}</div>
          <small>{ROLE_LABEL[user.role]} · {user.territory}</small>
        </div>
        {DEMO && (
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => { if (confirm("Reset all demo data?")) resetDemo(); }}>
            Reset demo data
          </button>
        )}
        <button className="btn sm" style={{ marginTop: 6 }} onClick={logout}>Sign out</button>
      </aside>

      <div className="main">
        <div className="topbar">
          <strong>{active.label}</strong>
          <div className="row">
            {tracking && <span className="pill" title="Your route is being recorded while signed in"><span className="dot" style={{ background: "var(--green)" }} /> Tracking</span>}
            <SyncStatus />
            {DEMO && <span className="demo-pill">Demo · local storage</span>}
            <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
            {user.role === "rep" && <NudgeBell user={user} />}
            <ThemeToggle />
          </div>
        </div>
        <div className="content">
          <Suspense fallback={<div className="empty">Loading…</div>}>
            <Page user={user} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const theme = useTheme();
  return (
    <button className="icon-btn" onClick={toggleTheme} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
