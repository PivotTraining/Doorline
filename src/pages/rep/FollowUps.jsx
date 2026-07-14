import { useState } from "react";
import { useStore, getState, DISPOS } from "../../store";
import DoorEditor from "../../components/DoorEditor.jsx";
import { localDay } from "../../lib/date.js";

export default function FollowUps({ user }) {
  useStore();
  const state = getState();
  const [edit, setEdit] = useState(null);
  const today = localDay();

  const items = state.homes
    .filter((h) => h.repId === user.id && ["callback", "appt"].includes(h.status))
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));

  const bucket = (h) => {
    if (!h.due) return "Unscheduled";
    if (h.due < today) return "Overdue";
    if (h.due === today) return "Today";
    return "Upcoming";
  };
  const BUCKETS = ["Overdue", "Today", "Upcoming", "Unscheduled"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Follow-ups</h1>
          <p>Come-backs and appointments, scheduled by date.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card empty">No follow-ups yet. Log a "Come back" or "Appointment" on the map.</div>
      ) : (
        BUCKETS.map((b) => {
          const rows = items.filter((h) => bucket(h) === b);
          if (!rows.length) return null;
          return (
            <div key={b} className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ color: b === "Overdue" ? "var(--red)" : b === "Today" ? "var(--amber)" : undefined }}>{b} ({rows.length})</h3>
              <div className="table-scroll">
                <table className="tbl">
                  <thead><tr><th>Address</th><th>Outcome</th><th>Contact</th><th>Due</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((h) => (
                      <tr key={h.id}>
                        <td>{h.addr}</td>
                        <td><span className="pill"><span className="dot" style={{ background: DISPOS[h.status].hex }} /> {DISPOS[h.status].lab}</span></td>
                        <td className="muted">{h.contact || "—"}{h.phone ? ` · ${h.phone}` : ""}</td>
                        <td className="muted">{h.due || "—"}</td>
                        <td><button className="btn sm" onClick={() => setEdit(h)}>Update</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {edit && <DoorEditor door={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
