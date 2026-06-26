import { useState } from "react";
import { useStore, getState, DISPOS } from "../../store";

export default function ActivitySheet() {
  useStore();
  const state = getState();
  const reps = state.users.filter((u) => u.role === "rep");
  const [rep, setRep] = useState("all");
  const [status, setStatus] = useState("all");

  const name = (id) => state.users.find((u) => u.id === id)?.name || "—";
  let rows = state.homes.filter((h) => h.status !== "untouched");
  if (rep !== "all") rows = rows.filter((h) => h.repId === rep);
  if (status !== "all") rows = rows.filter((h) => h.status === status);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity Sheet</h1>
          <p>Every logged door across the team — filter by rep or outcome.</p>
        </div>
        <div className="row">
          <select className="select" style={{ width: "auto" }} value={rep} onChange={(e) => setRep(e.target.value)}>
            <option value="all">All reps</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All outcomes</option>
            {Object.entries(DISPOS).map(([k, v]) => <option key={k} value={k}>{v.lab}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>{rows.length} records</p>
        {rows.length === 0 ? (
          <p className="muted">No activity matches these filters.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Rep</th><th>Address</th><th>Outcome</th><th>Contact</th><th>Due</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td>{name(h.repId)}</td>
                  <td>{h.addr}</td>
                  <td><span className="pill"><span className="dot" style={{ background: DISPOS[h.status].hex }} /> {DISPOS[h.status].lab}</span></td>
                  <td className="muted">{h.contact || "—"}{h.phone ? ` · ${h.phone}` : ""}</td>
                  <td className="muted">{h.due || "—"}</td>
                  <td className="muted" style={{ maxWidth: 280 }}>{h.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
