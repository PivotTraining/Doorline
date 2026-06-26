import { useState } from "react";
import { useStore, getState, DISPOS } from "../../store";
import FieldMap from "../../components/FieldMap.jsx";
import DoorEditor from "../../components/DoorEditor.jsx";

export default function Doors({ user }) {
  useStore();
  const state = getState();
  const [edit, setEdit] = useState(null);
  const mine = state.homes.filter((h) => h.repId === user.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Map / Doors</h1>
          <p>Tap any spot to drop a door, then log the outcome. Search an address or use your location.</p>
        </div>
      </div>

      <FieldMap repId={user.id} />

      <div className="card" style={{ marginTop: 18 }}>
        <h3>My doors ({mine.length})</h3>
        {mine.length === 0 ? (
          <p className="muted">No doors yet — tap the map to drop your first one.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Address</th><th>Outcome</th><th>Contact</th><th>Notes</th><th></th></tr>
            </thead>
            <tbody>
              {mine.map((h) => (
                <tr key={h.id}>
                  <td>{h.addr}</td>
                  <td><span className="pill"><span className="dot" style={{ background: DISPOS[h.status].hex }} /> {DISPOS[h.status].lab}</span></td>
                  <td className="muted">{h.contact || "—"}</td>
                  <td className="muted" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.notes || "—"}</td>
                  <td><button className="btn sm" onClick={() => setEdit(h)}>Log</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {edit && <DoorEditor door={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
