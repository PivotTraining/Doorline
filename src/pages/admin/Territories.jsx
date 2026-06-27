import { useState } from "react";
import { useStore, getState, addTerritory, updateTerritory, removeTerritory } from "../../store";
import Modal from "../../components/Modal.jsx";

const COLORS = ["#2e90fa", "#16a34a", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6"];
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ name: "", assignedTo: "", color: COLORS[0], start: today(), end: today(), notes: "" });

export default function Territories({ user }) {
  useStore();
  const state = getState();
  const reps = state.users.filter((u) => u.role === "rep");
  const repName = (id) => state.users.find((u) => u.id === id)?.name || "Unassigned";
  const [form, setForm] = useState(null);

  const open = (t) => setForm(t ? { ...t } : blank());
  const submit = () => {
    if (!form.name.trim()) return alert("Name the territory.");
    if (form.id) updateTerritory(form.id, form);
    else addTerritory(form);
    setForm(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Territories</h1>
          <p>Assign and schedule territory blocks for the team. (Managers & admins)</p>
        </div>
        <button className="btn primary" onClick={() => open()}>+ New territory</button>
      </div>

      <div className="card">
        {state.territories.length === 0 ? (
          <p className="muted">No territories scheduled yet.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Territory</th><th>Assigned to</th><th>Schedule</th><th>Notes</th><th></th></tr>
            </thead>
            <tbody>
              {state.territories.map((t) => (
                <tr key={t.id}>
                  <td><span className="pill"><span className="dot" style={{ background: t.color }} /> {t.name}</span></td>
                  <td>{repName(t.assignedTo)}</td>
                  <td className="muted">{t.start} → {t.end}</td>
                  <td className="muted" style={{ maxWidth: 240 }}>{t.notes || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn sm" onClick={() => open(t)}>Edit</button>
                      <button className="btn sm danger" onClick={() => { if (confirm(`Remove ${t.name}?`)) removeTerritory(t.id); }}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <Modal
          title={form.id ? "Edit territory" : "New territory"}
          onClose={() => setForm(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn primary" onClick={submit}>{form.id ? "Save" : "Create"}</button>
          </>}
        >
          <label className="field">
            <span>Name</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="North District" />
          </label>
          <label className="field">
            <span>Assign to rep</span>
            <select className="select" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
              <option value="">— Unassigned —</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Start</span>
              <input className="input" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>End</span>
              <input className="input" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Color</span>
            <div className="row" style={{ gap: 8 }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  style={{ width: 26, height: 26, borderRadius: 8, background: c, border: form.color === c ? "2px solid var(--text)" : "1px solid var(--border)", cursor: "pointer" }} />
              ))}
            </div>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Notes</span>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Focus streets, goals…" />
          </label>
        </Modal>
      )}
    </>
  );
}
