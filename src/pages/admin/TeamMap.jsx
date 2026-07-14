import { useStore, getState, DISPOS, repAccountability, repGeofenceStatus } from "../../store";
import FieldMap from "../../components/FieldMap.jsx";

const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export default function TeamMap() {
  useStore();
  const state = getState();
  const worked = state.homes.filter((h) => h.status !== "untouched");
  const counts = Object.keys(DISPOS).reduce((a, k) => ({ ...a, [k]: state.homes.filter((h) => h.status === k).length }), {});
  const reps = state.users.filter((u) => u.role === "rep");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team Map</h1>
          <p>Every door across the org, each rep's route, and live positions. Toggle "Routes" on the map.</p>
        </div>
      </div>

      <div className="cards grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{state.homes.length}</div><div className="l">Total doors</div></div>
        <div className="card stat"><div className="n">{worked.length}</div><div className="l">Worked</div></div>
        <div className="card stat"><div className="n">{counts.appt}</div><div className="l">Appointments</div></div>
        <div className="card stat"><div className="n">{counts.sold}</div><div className="l">Sold</div></div>
      </div>

      <FieldMap admin height={560} />

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Field accountability</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Time on the clock today vs. doors actually worked today (each rep's own timezone). Routes are recorded while a rep is signed in.</p>
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr><th>Rep</th><th>Status</th><th>Zone</th><th>Time on</th><th>Doors today</th><th>Route points</th><th>Effort</th></tr>
            </thead>
            <tbody>
              {reps.map((r) => {
                const a = repAccountability(r.id);
                const geo = repGeofenceStatus(r.id);
                const perHr = a.mins ? (a.doors / (a.mins / 60)) : 0;
                const flag = a.mins >= 120 && a.doors <= 3;
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>
                      <span className="pill">
                        <span className="dot" style={{ background: a.online ? "var(--green)" : a.consent === "denied" ? "var(--red)" : "var(--muted)" }} />
                        {a.online ? "online" : a.consent === "denied" ? "not sharing" : "offline"}
                      </span>
                    </td>
                    <td>
                      {geo == null ? <span className="muted">—</span> : geo.inside
                        ? <span className="pill"><span className="dot" style={{ background: "var(--green)" }} /> In zone</span>
                        : <span className="pill" style={{ borderColor: "var(--red)", color: "var(--red)" }}><span className="dot" style={{ background: "var(--red)" }} /> Outside {geo.zoneName}</span>}
                    </td>
                    <td className="muted">{dur(a.mins)}</td>
                    <td>{a.doors}</td>
                    <td className="muted">{a.points}</td>
                    <td style={{ color: flag ? "var(--red)" : "var(--muted)" }}>
                      {a.mins ? `${perHr.toFixed(1)}/hr` : "—"}{flag && " ⚠️"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
