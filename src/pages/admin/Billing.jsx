import { useStore, getState, PLAN_NAME } from "../../store";

export default function Billing() {
  useStore();
  const state = getState();
  const seats = state.users.filter((u) => u.plan > 0 && u.status === "active");
  const inactive = state.users.filter((u) => u.plan > 0 && u.status !== "active");

  // group active seats by plan
  const tiers = {};
  seats.forEach((u) => { tiers[u.plan] = (tiers[u.plan] || 0) + 1; });
  const monthly = seats.reduce((a, u) => a + u.plan, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Billing</h1>
          <p>Seats are billed per active rep/manager. Numbers update the moment you change Personnel.</p>
        </div>
      </div>

      <div className="cards grid-3" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{seats.length}</div><div className="l">Active billable seats</div></div>
        <div className="card stat"><div className="n">${(monthly / 100).toLocaleString()}</div><div className="l">Monthly total</div></div>
        <div className="card stat"><div className="n">${((monthly * 12) / 100).toLocaleString()}</div><div className="l">Annualized</div></div>
      </div>

      <div className="cards grid-2">
        <div className="card">
          <h3>By plan</h3>
          <table className="tbl">
            <thead><tr><th>Plan</th><th>Seats</th><th>Unit</th><th style={{ textAlign: "right" }}>Subtotal</th></tr></thead>
            <tbody>
              {Object.entries(tiers).map(([plan, n]) => (
                <tr key={plan}>
                  <td>{PLAN_NAME[plan]}</td>
                  <td>{n}</td>
                  <td className="muted">${(plan / 100).toFixed(0)}/mo</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>${((plan * n) / 100).toLocaleString()}</td>
                </tr>
              ))}
              {seats.length === 0 && <tr><td colSpan={4} className="muted">No active billable seats.</td></tr>}
            </tbody>
            <tfoot>
              <tr><td colSpan={3} style={{ textAlign: "right", fontWeight: 600 }}>Monthly total</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "var(--green)" }}>${(monthly / 100).toLocaleString()}</td></tr>
            </tfoot>
          </table>
        </div>

        <div className="card">
          <h3>Seat ledger</h3>
          <p className="muted" style={{ marginTop: 0 }}>Free seats (owner / admin / viewer) are never billed.</p>
          <table className="tbl">
            <thead><tr><th>Person</th><th>Plan</th><th>Status</th></tr></thead>
            <tbody>
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="muted">{PLAN_NAME[u.plan] || "Free"}</td>
                  <td>
                    <span className="pill">
                      <span className="dot" style={{ background: u.status === "active" ? "var(--green)" : "var(--muted)" }} />
                      {u.plan > 0 ? (u.status === "active" ? "billed" : "paused") : "free"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {inactive.length > 0 && <p className="muted" style={{ fontSize: 13 }}>{inactive.length} paused seat(s) excluded from billing.</p>}
        </div>
      </div>
    </>
  );
}
