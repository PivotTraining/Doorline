import { useState } from "react";
import { useStore, getState, DISPOS } from "../../store";
import FieldMap from "../../components/FieldMap.jsx";
import DoorEditor from "../../components/DoorEditor.jsx";
import { repZones, inRepZone } from "../../lib/geo.js";

export default function Doors({ user }) {
  useStore();
  const state = getState();
  const [edit, setEdit] = useState(null);
  const [zoneOnly, setZoneOnly] = useState(false);
  const mine = state.homes.filter((h) => h.repId === user.id);
  const hasZone = repZones(state, user.id).length > 0;
  const shown = zoneOnly && hasZone ? mine.filter((h) => inRepZone(state, user.id, h.lat, h.lng)) : mine;

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
        <div className="row between">
          <h3 style={{ margin: 0 }}>My doors ({shown.length})</h3>
          {hasZone && (
            <label className="row" style={{ gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={zoneOnly} onChange={(e) => setZoneOnly(e.target.checked)} /> My zone only
            </label>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="muted">{zoneOnly ? "No doors inside your assigned zone yet." : "No doors yet — tap the map to drop your first one."}</p>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr><th>Address</th><th>Outcome</th><th>Contact</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {shown.map((h) => (
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
          </div>
        )}
      </div>

      {edit && <DoorEditor door={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
