import { useState } from "react";
import { useStore, getState, addTerritory, updateTerritory, removeTerritory, updateUser } from "../../store";
import TerritoryMap from "../../components/TerritoryMap.jsx";
import { localDay } from "../../lib/date.js";

const COLORS = ["#2e90fa", "#16a34a", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6"];
const today = () => localDay();
const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function Territories() {
  useStore();
  const state = getState();
  const reps = state.users.filter((u) => u.role === "rep");
  const repName = (id) => state.users.find((u) => u.id === id)?.name;
  const [selId, setSelId] = useState(state.territories[0]?.id || null);
  const [drawId, setDrawId] = useState(null);
  const sel = state.territories.find((t) => t.id === selId) || null;

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
          <h1>Territories</h1>
          <p>Design and stage the field — assign reps, schedule blocks, and draw each zone on the map.</p>
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
          <TerritoryMap territories={state.territories} editId={drawId} onSave={saveBoundary} onCancel={() => setDrawId(null)} height={420} />

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
                  <span>Assign rep</span>
                  <select className="select" value={sel.assignedTo || ""} onChange={(e) => assign(e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
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
    </>
  );
}
