import { useStore, getState, repStats } from "../../store";

export default function Leaderboard({ user }) {
  useStore();
  const state = getState();
  const reps = state.users
    .filter((u) => u.role === "rep")
    .map((r) => {
      const s = repStats(r.id);
      const revenue = state.deals.filter((d) => d.repId === r.id).reduce((a, d) => a + (d.value || 0), 0);
      return { ...r, ...s, revenue };
    })
    .sort((a, b) => b.revenue - a.revenue || b.closes - a.closes);

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leaderboard</h1>
          <p>Ranked by contract value, then sales.</p>
        </div>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr><th>#</th><th>Rep</th><th>Doors</th><th>Convos</th><th>Appts</th><th>Sales</th><th>Close %</th><th style={{ textAlign: "right" }}>Revenue</th></tr>
          </thead>
          <tbody>
            {reps.map((r, i) => (
              <tr key={r.id} style={r.id === user.id ? { background: "var(--panel-2)" } : undefined}>
                <td style={{ fontSize: 18 }}>{medal(i)}</td>
                <td>{r.name}{r.id === user.id && <span className="tag" style={{ marginLeft: 8 }}>you</span>}</td>
                <td>{r.knocks}</td>
                <td>{r.contacts}</td>
                <td>{r.appts}</td>
                <td>{r.closes}</td>
                <td>{r.rate}%</td>
                <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>${r.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
