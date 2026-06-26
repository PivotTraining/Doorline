import { useState } from "react";
import { useStore, currentUser, isAdmin, logout, ROLE_LABEL, resetDemo } from "./store";
import { DEMO } from "./supabaseClient";

import Login from "./pages/Login.jsx";
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
import ActivitySheet from "./pages/admin/ActivitySheet.jsx";
import Deals from "./pages/admin/Deals.jsx";
import Billing from "./pages/admin/Billing.jsx";

const REP_NAV = [
  { id: "myday", label: "My Day", ico: "☀️", el: MyDay },
  { id: "doors", label: "Map / Doors", ico: "📍", el: Doors },
  { id: "followups", label: "Follow-ups", ico: "🔁", el: FollowUps },
  { id: "mydeals", label: "My Deals", ico: "💰", el: MyDeals },
  { id: "leaderboard", label: "Leaderboard", ico: "🏆", el: Leaderboard },
  { id: "profile", label: "Profile", ico: "👤", el: Profile },
];
const ADMIN_NAV = [
  { id: "personnel", label: "Personnel", ico: "👥", el: Personnel },
  { id: "teammap", label: "Team Map", ico: "🗺️", el: TeamMap },
  { id: "activity", label: "Activity Sheet", ico: "📋", el: ActivitySheet },
  { id: "deals", label: "Deals", ico: "💼", el: Deals },
  { id: "billing", label: "Billing", ico: "🧾", el: Billing },
];

export default function App() {
  useStore(); // subscribe to the shared store
  const user = currentUser();
  if (!user) return <Login />;
  return <Shell user={user} />;
}

function Shell({ user }) {
  // Reps see the field nav; owners/admins/managers/viewers see the admin console.
  const nav = user.role === "rep" ? REP_NAV : ADMIN_NAV;
  const [tab, setTab] = useState(nav[0].id);
  const active = nav.find((n) => n.id === tab) || nav[0];
  const Page = active.el;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="logo">D</div>
          <b>Doorline</b>
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
            {DEMO && <span className="demo-pill">Demo mode · local storage</span>}
            <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
          </div>
        </div>
        <div className="content">
          <Page user={user} />
        </div>
      </div>
    </div>
  );
}
