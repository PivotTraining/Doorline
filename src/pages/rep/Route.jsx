import { useState } from "react";
import {
  useStore, getState, DISPOS, localDay,
  createRoute, repRoutes, routeStops, optimizeRoute,
  setRouteStopDone, removeRoute, removeRouteStop,
} from "../../store";
import DoorEditor from "../../components/DoorEditor.jsx";
import { repZones, inRepZone } from "../../lib/geo.js";
import { routeLengthM, fmtDistance } from "../../lib/route.js";

const lastWorked = (h) => {
  const acts = h?.activity || [];
  if (!acts.length) return null;
  return acts.reduce((m, a) => Math.max(m, a.ts || 0), 0) || null;
};
const fmtDay = (ts) => {
  if (!ts) return null;
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return "today";
  const yday = new Date(now); yday.setDate(now.getDate() - 1);
  if (d.toDateString() === yday.toDateString()) return "yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export default function Route({ user }) {
  useStore();
  const state = getState();
  const [edit, setEdit] = useState(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [name, setName] = useState("");
  const [zoneOnly, setZoneOnly] = useState(false);
  const [hideWorked, setHideWorked] = useState(true);
  const [activeId, setActiveId] = useState(null);

  const today = localDay();
  const routes = repRoutes(user.id, today);
  const active = routes.find((r) => r.id === activeId) || routes[0] || null;
  const stops = active ? routeStops(active.id) : [];
  const hasZone = repZones(state, user.id).length > 0;

  // Candidate doors for a new route. "Not worked yet" is the default because
  // the usual reason to plan a route is to cover what's still outstanding.
  const mine = state.homes.filter((h) => h.repId === user.id);
  const candidates = mine
    .filter((h) => (!zoneOnly || !hasZone ? true : inRepZone(state, user.id, h.lat, h.lng)))
    .filter((h) => (hideWorked ? h.status === "untouched" : true))
    .filter((h) => !h.serviced);   // already a customer — not a pitch target

  const toggle = (id) => setPicked((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  // Order the walk from where the rep actually is, falling back to letting
  // the algorithm pick its own start when location isn't available.
  const withPosition = (fn) => {
    if (!navigator.geolocation) return fn(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => fn({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => fn(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const build = () => {
    if (!picked.size) return;
    const ids = [...picked];
    withPosition((start) => {
      const rt = createRoute({ repId: user.id, name: name.trim() || `Route ${routes.length + 1}`, day: today, homeIds: ids, start });
      setActiveId(rt.id);
      setPicked(new Set());
      setName("");
      setPicking(false);
    });
  };

  const reoptimize = () => active && withPosition((start) => optimizeRoute(active.id, start));

  const remaining = stops.filter((s) => !s.done);
  const walk = routeLengthM(remaining.map((s) => s.home), null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Route</h1>
          <p>Plan the order you walk your doors. Tap any stop to see what's already been worked there.</p>
        </div>
      </div>

      {/* ---- route picker + actions ---- */}
      <div className="card">
        <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {routes.length > 0 && (
              <select className="select" value={active?.id || ""} onChange={(e) => setActiveId(e.target.value)}>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <button className="btn sm" onClick={() => setPicking((v) => !v)}>
              {picking ? "Cancel" : "+ New route"}
            </button>
            {active && <button className="btn sm" onClick={reoptimize}>Re-order from here</button>}
            {active && (
              <button className="btn sm" onClick={() => { removeRoute(active.id); setActiveId(null); }}>
                Delete
              </button>
            )}
          </div>
          {active && stops.length > 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              {remaining.length} left of {stops.length} · {fmtDistance(walk)} to walk
            </div>
          )}
        </div>
      </div>

      {/* ---- builder ---- */}
      {picking && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>Pick the doors ({picked.size} selected)</h3>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <input className="input" style={{ maxWidth: 240 }} value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Route name (optional)" />
            {hasZone && (
              <label className="row" style={{ gap: 6, fontSize: 13, cursor: "pointer", alignItems: "center" }}>
                <input type="checkbox" checked={zoneOnly} onChange={(e) => setZoneOnly(e.target.checked)} /> My zone only
              </label>
            )}
            <label className="row" style={{ gap: 6, fontSize: 13, cursor: "pointer", alignItems: "center" }}>
              <input type="checkbox" checked={hideWorked} onChange={(e) => setHideWorked(e.target.checked)} /> Not worked yet
            </label>
          </div>

          {candidates.length === 0 ? (
            <p className="muted">
              No doors match. Drop some on the map first, or untick the filters above.
            </p>
          ) : (
            <>
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <button className="btn sm" onClick={() => setPicked(new Set(candidates.map((h) => h.id)))}>Select all</button>
                <button className="btn sm" onClick={() => setPicked(new Set())}>Clear</button>
              </div>
              <div className="table-scroll" style={{ maxHeight: 320 }}>
                <table className="tbl">
                  <thead><tr><th></th><th>Address</th><th>Homeowner</th><th>Status</th></tr></thead>
                  <tbody>
                    {candidates.map((h) => (
                      <tr key={h.id} onClick={() => toggle(h.id)} style={{ cursor: "pointer" }}>
                        <td><input type="checkbox" readOnly checked={picked.has(h.id)} /></td>
                        <td>{h.addr}</td>
                        <td className="muted">{h.ownerName || "—"}</td>
                        <td><span className="pill"><span className="dot" style={{ background: DISPOS[h.status].hex }} /> {DISPOS[h.status].lab}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={build} disabled={!picked.size}>
                  Build route ({picked.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- the walk ---- */}
      <div className="card" style={{ marginTop: 18 }}>
        {!active ? (
          <p className="muted">No route for today yet — tap “New route” to plan one.</p>
        ) : stops.length === 0 ? (
          <p className="muted">This route has no stops.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {stops.map((s, i) => {
              const h = s.home;
              const worked = lastWorked(h);
              return (
                <div key={s.id} className="card"
                  style={{ background: "var(--bg-2)", padding: "10px 12px", opacity: s.done ? 0.55 : 1 }}>
                  <div className="row between" style={{ alignItems: "flex-start", gap: 10 }}>
                    <div className="row" style={{ gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                      <span style={{
                        flexShrink: 0, width: 26, height: 26, borderRadius: "50%", display: "grid",
                        placeItems: "center", fontSize: 13, fontWeight: 700,
                        background: s.done ? "var(--muted)" : DISPOS[h.status].hex, color: "#fff",
                      }}>{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, textDecoration: s.done ? "line-through" : "none" }}>{h.addr}</div>
                        {h.ownerName && <div style={{ fontSize: 13 }}>{h.ownerName}</div>}
                        {/* What's been worked here, and whether they're already served. */}
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          <span className="dot" style={{ background: DISPOS[h.status].hex }} /> {DISPOS[h.status].lab}
                          {worked ? ` · worked ${fmtDay(worked)}` : " · never worked"}
                          {h.serviced ? " · ✅ already a customer" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                      <button className="btn sm" onClick={() => setEdit(h)}>Open</button>
                      <button className="btn sm" onClick={() => setRouteStopDone(s.id, !s.done)}>
                        {s.done ? "Undo" : "Done"}
                      </button>
                      <button className="btn sm" onClick={() => removeRouteStop(s.id)}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {edit && <DoorEditor door={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
