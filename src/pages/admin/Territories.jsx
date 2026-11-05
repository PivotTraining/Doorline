import { useState } from "react";
import { useStore, getState, addTerritory, updateTerritory, removeTerritory, updateUser,
  isAgentLive, repGeofenceStatus, activeCampaigns, sheetTotals, isDaySubmitted, SHEET_COLS } from "../../store";
import TerritoryMap from "../../components/TerritoryMap.jsx";
import { localDay } from "../../lib/date.js";
import { pointInPolygon } from "../../lib/geo.js";

const COLORS = ["#2e90fa", "#16a34a", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6"];
const today = () => localDay();
const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function Territories() {
  useStore();
  const state = getState();
  const repName = (id) => state.users.find((u) => u.id === id)?.name;
  const [selId, setSelId] = useState(state.territories[0]?.id || null);
  const [drawId, setDrawId] = useState(null);
  const [campaign, setCampaign] = useState("all");
  const [reviewRep, setReviewRep] = useState("");
  const [reviewDate, setReviewDate] = useState(() => localDay());
  const sel = state.territories.find((t) => t.id === selId) || null;

  // Assignment is scoped by campaign: pick the campaign, then pick from the
  // agents onboarded with it rather than the whole company.
  const campaigns = activeCampaigns();
  const campaignsAvailable = state.campaignsAvailable;
  const allReps = state.users.filter((u) => u.role === "rep" || u.role === "manager");
  const reps = campaign === "all"
    ? allReps
    : (() => {
        const ids = new Set((state.campaignMembers || [])
          .filter((m) => m.campaignId === campaign).map((m) => m.repId));
        return allReps.filter((u) => ids.has(u.id));
      })();

  // Everyone on the clock right now, with their last known position.
  const liveAgents = allReps
    .map((u) => {
      const p = state.presence[u.id];
      if (!isAgentLive(p) || p?.lat == null || p?.lng == null) return null;
      const geo = repGeofenceStatus(u.id);
      return { id: u.id, name: u.name, lat: p.lat, lng: p.lng, inside: geo ? geo.inside : null, zoneName: geo?.zoneName };
    })
    .filter(Boolean);

  const createNew = () => {
    const t = addTerritory({ name: "New territory", color: COLORS[state.territories.length % COLORS.length], assignedTo: "", start: today(), end: today(), notes: "" });
    setSelId(t.id);
    setDrawId(null);
  };
  const patch = (p) => updateTerritory(selId, p);
  const assign = (repId) => {
    const prev = sel.assignedTo;
    if (prev && prev !== repId) {
      const old = state.users.find((u) => u.id === prev);
      if (old && old.territory === sel.name) updateUser(old.id, { territory: "—" });
    }
    updateTerritory(selId, { assignedTo: repId });
    if (repId) updateUser(repId, { territory: sel.name });
  };
  const saveBoundary = (pts) => { updateTerritory(drawId, { boundary: pts }); setDrawId(null); };
  const del = (t) => {
    if (!confirm(`Remove ${t.name}?`)) return;
    if (t.assignedTo) { const u = state.users.find((x) => x.id === t.assignedTo); if (u && u.territory === t.name) updateUser(u.id, { territory: "—" }); }
    removeTerritory(t.id);
    if (selId === t.id) setSelId(null);
    if (drawId === t.id) setDrawId(null);
  };

  const hasZone = (t) => t.boundary && t.boundary.length >= 3;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Territory</h1>
          <p>Draw zones, assign them, and watch the field live. {liveAgents.length > 0
            ? `${liveAgents.length} ${liveAgents.length === 1 ? "agent is" : "agents are"} on the clock.`
            : "Nobody is on the clock right now."}</p>
        </div>
        <button className="btn primary" onClick={createNew}>+ New territory</button>
      </div>

      <div className="terr-layout">
        {/* left: territory cards */}
        <div className="terr-list">
          {state.territories.length === 0 && <div className="card empty">No territories yet — create your first.</div>}
          {state.territories.map((t) => (
            <button key={t.id} className={"terr-card" + (t.id === selId ? " sel" : "")} style={{ "--c": t.color }} onClick={() => setSelId(t.id)}>
              <div className="row between" style={{ marginBottom: 4 }}>
                <span className="nm">{t.name}</span>
                <span className="tag" style={{ borderColor: hasZone(t) ? t.color : undefined, color: hasZone(t) ? t.color : undefined }}>
                  {hasZone(t) ? "▰ mapped" : "no zone"}
                </span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {t.assignedTo
                  ? <span className="terr-avatar" style={{ background: t.color }}>{initials(repName(t.assignedTo))}</span>
                  : <span className="terr-avatar muted-av">—</span>}
                <small className="muted">{t.assignedTo ? repName(t.assignedTo) : "Unassigned"} · {t.start || "—"}→{t.end || "—"}</small>
              </div>
            </button>
          ))}
        </div>

        {/* right: map + staging editor */}
        <div className="terr-stage">
          <TerritoryMap territories={state.territories} editId={drawId} onSave={saveBoundary}
            onCancel={() => setDrawId(null)} height={420} liveAgents={liveAgents} />

          {sel ? (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <h3 style={{ margin: 0 }}>Staging: {sel.name}</h3>
                <button className="btn sm danger" onClick={() => del(sel)}>Delete</button>
              </div>

              <div className="grid-2 cards" style={{ gap: 12 }}>
                <label className="field" style={{ margin: 0 }}>
                  <span>Name</span>
                  <input className="input" value={sel.name} onChange={(e) => patch({ name: e.target.value })} />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>Campaign</span>
                  <select className="select" value={campaign} disabled={!campaignsAvailable}
                    onChange={(e) => setCampaign(e.target.value)}>
                    <option value="all">All agents</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <small className="muted">
                    {campaignsAvailable
                      ? "Narrows the agent list below to those onboarded with this campaign."
                      : "Needs the campaigns update applied to the database."}
                  </small>
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>Assign agent</span>
                  <select className="select" value={sel.assignedTo || ""} onChange={(e) => assign(e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {campaign !== "all" && reps.length === 0 && (
                    <small className="muted">Nobody is onboarded with that campaign yet.</small>
                  )}
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>Start</span>
                  <input className="input" type="date" value={sel.start || ""} onChange={(e) => patch({ start: e.target.value })} />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>End</span>
                  <input className="input" type="date" value={sel.end || ""} onChange={(e) => patch({ end: e.target.value })} />
                </label>
              </div>

              <div style={{ marginTop: 12 }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Color</span>
                <div className="row" style={{ gap: 8 }}>
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => patch({ color: c })}
                      style={{ width: 26, height: 26, borderRadius: 8, background: c, border: sel.color === c ? "2px solid var(--text)" : "1px solid var(--border)", cursor: "pointer" }} />
                  ))}
                </div>
              </div>

              <label className="field" style={{ marginTop: 12 }}>
                <span>Notes</span>
                <textarea className="input" rows={2} value={sel.notes || ""} onChange={(e) => patch({ notes: e.target.value })} placeholder="Focus streets, goals…" />
              </label>

              <div className="row between" style={{ marginTop: 4 }}>
                <span className="pill"><span className="dot" style={{ background: hasZone(sel) ? sel.color : "var(--muted)" }} /> {hasZone(sel) ? `Zone: ${sel.boundary.length} pts` : "No zone drawn"}</span>
                <div className="row" style={{ gap: 8 }}>
                  {hasZone(sel) && <button className="btn sm" onClick={() => patch({ boundary: [] })}>Clear zone</button>}
                  <button className="btn sm primary" onClick={() => setDrawId(drawId === sel.id ? null : sel.id)} style={drawId === sel.id ? { background: "var(--amber)" } : undefined}>
                    {drawId === sel.id ? "✓ Drawing… (use map)" : "✏️ Draw / ZIP zone"}
                  </button>
                </div>
              </div>
              {drawId === sel.id && <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>Tap the map to drop boundary points, or enter a ZIP — then “Save zone”.</p>}
            </div>
          ) : (
            <div className="card empty" style={{ marginTop: 14 }}>Select a territory on the left to stage it, or create a new one.</div>
          )}
        </div>
      </div>

      <DayReview
        reps={allReps}
        repId={reviewRep}
        date={reviewDate}
        onRep={setReviewRep}
        onDate={setReviewDate}
      />
    </>
  );
}

// What an agent actually did on a given day, for reviewing after they have
// signed off -- their doors, their totals, whether they closed the day out,
// and which territory the work fell in.
function DayReview({ reps, repId, date, onRep, onDate }) {
  const state = getState();
  const rep = reps.find((r) => r.id === repId) || null;
  const rows = rep ? state.streetRows.filter((r) => r.repId === rep.id && r.date === date) : [];
  const t = sheetTotals(rows);
  const submitted = rep ? isDaySubmitted(rep.id, date) : false;

  // Territory worked, from two independent signals: what was assigned to
  // them for that date, and any zone their own doors actually fall inside.
  // The second matters because an agent can work somewhere they were never
  // formally assigned, which is exactly what a review should surface.
  const assigned = rep
    ? state.territories.filter((z) => z.assignedTo === rep.id
        && (!z.start || z.start <= date) && (!z.end || z.end >= date))
    : [];
  const theirDoors = rep ? state.homes.filter((h) => h.repId === rep.id && h.lat != null && h.lng != null) : [];
  const entered = rep
    ? state.territories.filter((z) => z.boundary && z.boundary.length >= 3
        && theirDoors.some((h) => pointInPolygon([h.lat, h.lng], z.boundary)))
    : [];
  const assignedIds = new Set(assigned.map((z) => z.id));
  const unassignedZones = entered.filter((z) => !assignedIds.has(z.id));

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="row between" style={{ flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Day review</h3>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            What an agent worked on a given day, and where it fell.
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select className="select" value={repId} onChange={(e) => onRep(e.target.value)} style={{ width: "auto" }}>
            <option value="">— Pick an agent —</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="input" type="date" value={date} onChange={(e) => onDate(e.target.value)} style={{ width: "auto" }} />
        </div>
      </div>

      {!rep ? (
        <div className="empty">Pick an agent to see their day.</div>
      ) : (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span className="pill">
              <span className="dot" style={{ background: submitted ? "var(--green)" : "var(--amber)" }} />
              {submitted ? "Day closed out" : "Not closed out"}
            </span>
            {assigned.length > 0
              ? assigned.map((z) => (
                  <span key={z.id} className="pill" style={{ borderColor: z.color, color: z.color }}>
                    <span className="dot" style={{ background: z.color }} /> assigned: {z.name}
                  </span>
                ))
              : <span className="pill muted-pill">no territory assigned that day</span>}
            {unassignedZones.map((z) => (
              <span key={z.id} className="pill" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>
                <span className="dot" style={{ background: "var(--amber)" }} /> also worked: {z.name}
              </span>
            ))}
          </div>

          <div className="cards grid-5" style={{ marginBottom: 12 }}>
            <div className="card stat"><div className="n">{t.doors}</div><div className="l">Doors</div></div>
            <div className="card stat"><div className="n">{t.dm}</div><div className="l">DM</div></div>
            <div className="card stat"><div className="n">{t.bid}</div><div className="l">Presentations</div></div>
            <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{t.d}</div><div className="l">Sold</div></div>
            <div className="card stat"><div className="n">{t.ni}</div><div className="l">Not interested</div></div>
          </div>

          {rows.length === 0 ? (
            <div className="empty">Nothing logged for {date}.</div>
          ) : (
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr><th>#</th><th>Address</th><th>Marked</th><th>Customer</th><th>Comments</th><th>CB</th></tr>
                </thead>
                <tbody>
                  {[...rows].sort((a, b) => (a.slot || 0) - (b.slot || 0)).map((r) => (
                    <tr key={r.id}>
                      <td className="muted">{r.slot || "—"}</td>
                      <td>{r.street || <span className="muted">—</span>}</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {SHEET_COLS.filter((c) => r[c.key]).map((c) => c.lab).join(" · ") || "—"}
                      </td>
                      <td className="muted">{r.customer || "—"}</td>
                      <td className="muted">{r.comments || "—"}</td>
                      <td className="muted">{r.cb || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
