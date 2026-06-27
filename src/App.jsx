import { useState } from "react";
import { useStore, getState, currentUser, logout, ROLE_LABEL, resetDemo } from "./store";
import { DEMO } from "./supabaseClient";
import { useTheme, toggleTheme } from "./theme.js";
import RepTracker from "./components/RepTracker.jsx";

import Login from "./pages/Login.jsx";
import Bulletin from "./pages/Bulletin.jsx";
// rep
import MyDay from "./pages/rep/MyDay.jsx";
import Doors from "./pages/rep/Doors.jsx";
import FollowUps from "./pages/rep/FollowUps.jsx";
import MyDeals from "./pages/rep/MyDeals.jsx";
import Leaderboard from "./pages/rep/Leaderboard.jsx";
import Profile from "./pages/rep/Profile.jsx";
// admin
import Personnel from "./pages/admin/Personnel.jsx";
import TeamMap from "./pages/admin/TeamMap.jsx";
import Territories from "./pages/admin/Territories.jsx";
import ActivitySheet from "./pages/admin/ActivitySheet.jsx";
import Deals from "./pages/admin/Deals.jsx";
import Billing from "./pages/admin/Billing.jsx";
import Settings from "./pages/admin/Settings.jsx";

const REP_NAV = [
  { id: "myday", label: "My Day", ico: "☀️", el: MyDay },
  { id: "doors", label: "Map / Doors", ico: "📍", el: Doors },
  { id: "followups", label: "Follow-ups", ico: "🔁", el: FollowUps },
  { id: "mydeals", label: "My Deals", ico: "💰", el: MyDeals },
  { id: "leaderboard", label: "Leaderboard", ico: "🏆", el: Leaderboard },
  { id: "bulletin", label: "Bulletin", ico: "📣", el: Bulletin },
  { id: "profile", label: "Profile", ico: "👤", el: Profile },
];
const ADMIN_NAV = [
  { id: "personnel", label: "Personnel", ico: "👥", el: Personnel },
  { id: "teammap", label: "Team Map", ico: "🗺️", el: TeamMap },
  { id: "territories", label: "Territories", ico: "🧭", el: Territories },
  { id: "activity", label: "Activity Sheet", ico: "📋", el: ActivitySheet },
  { id: "deals", label: "Deals", ico: "💼", el: Deals },
  { id: "bulletin", label: "Bulletin", ico: "📣", el: Bulletin },
  { id: "billing", label: "Billing", ico: "🧾", el: Billing },
  { id: "settings", label: "Settings", ico: "⚙️", el: Settings },
];

export default function App() {
  useStore(); // subscribe to the shared store
  const user = currentUser();
  if (!user) return <Login />;
  return <Shell user={user} />;
}

function BrandMark({ size = 30 }) {
  const org = getState().org;
  return (
    <div className="logo" style={{ width: size, height: size }}>
      {org.logo ? <img src={org.logo} alt="" /> : (org.name?.[0]?.toUpperCase() || "D")}
    </div>
  );
}

function Shell({ user }) {
  useTheme();
  const org = getState().org;
  const nav = user.role === "rep" ? REP_NAV : ADMIN_NAV;
  const [tab, setTab] = useState(nav[0].id);
  const active = nav.find((n) => n.id === tab) || nav[0];
  const Page = active.el;

  const presence = getState().presence[user.id] || {};
  const tracking = user.role === "rep" && presence.online && presence.consent === "granted";

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
        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => { if (confirm("Reset all demo data?")) resetDemo(); }}>
          Reset demo data
        </button>
        <button className="btn sm" style={{ marginTop: 6 }} onClick={logout}>Sign out</button>
      </aside>

      <div className="main">
        <div className="topbar">
          <strong>{active.label}</strong>
          <div className="row">
            {tracking && <span className="pill" title="Your route is being recorded while signed in"><span className="dot" style={{ background: "var(--green)" }} /> Tracking</span>}
            {DEMO && <span className="demo-pill">Demo · local storage</span>}
            <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
            <ThemeToggle />
          </div>
        </div>
        <div className="content">
          <Page user={user} />
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
