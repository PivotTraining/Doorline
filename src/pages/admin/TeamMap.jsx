import { useStore, getState, DISPOS } from "../../store";
import FieldMap from "../../components/FieldMap.jsx";

export default function TeamMap() {
  useStore();
  const state = getState();
  const worked = state.homes.filter((h) => h.status !== "untouched");
  const counts = Object.keys(DISPOS).reduce((a, k) => ({ ...a, [k]: state.homes.filter((h) => h.status === k).length }), {});

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team Map</h1>
          <p>Every door across the org, plus live rep positions (simulated in demo).</p>
        </div>
      </div>

      <div className="cards grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{state.homes.length}</div><div className="l">Total doors</div></div>
        <div className="card stat"><div className="n">{worked.length}</div><div className="l">Worked</div></div>
        <div className="card stat"><div className="n">{counts.appt}</div><div className="l">Appointments</div></div>
        <div className="card stat"><div className="n">{counts.sold}</div><div className="l">Sold</div></div>
      </div>

      <FieldMap admin height={580} />
    </>
  );
}
