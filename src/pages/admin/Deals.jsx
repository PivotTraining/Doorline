import { useStore, getState } from "../../store";

export default function Deals() {
  useStore();
  const state = getState();
  const name = (id) => state.users.find((u) => u.id === id)?.name || "—";
  const total = state.deals.reduce((a, d) => a + (d.value || 0), 0);
  const avg = state.deals.length ? Math.round(total / state.deals.length) : 0;

  // group by product
  const byProduct = {};
  state.deals.forEach((d) => { byProduct[d.product] = (byProduct[d.product] || 0) + (d.value || 0); });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Deals</h1>
          <p>Closed business across the whole team.</p>
        </div>
      </div>

      <div className="cards grid-3" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{state.deals.length}</div><div className="l">Deals</div></div>
        <div className="card stat"><div className="n">${total.toLocaleString()}</div><div className="l">Total value</div></div>
        <div className="card stat"><div className="n">${avg.toLocaleString()}</div><div className="l">Avg deal size</div></div>
      </div>

      <div className="cards grid-2">
        <div className="card">
          <h3>All deals</h3>
          {state.deals.length === 0 ? (
            <p className="muted">No deals closed yet.</p>
          ) : (
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Rep</th><th>Product</th><th style={{ textAlign: "right" }}>Value</th></tr></thead>
              <tbody>
                {state.deals.map((d) => (
                  <tr key={d.id}>
                    <td>{d.customer}</td>
                    <td className="muted">{name(d.repId)}</td>
                    <td className="muted">{d.product}</td>
                    <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>${(d.value || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>By product</h3>
          {Object.keys(byProduct).length === 0 ? (
            <p className="muted">—</p>
          ) : (
            Object.entries(byProduct)
              .sort((a, b) => b[1] - a[1])
              .map(([p, v]) => (
                <div key={p} style={{ marginBottom: 10 }}>
                  <div className="row between"><span>{p}</span><strong>${v.toLocaleString()}</strong></div>
                  <div style={{ height: 8, background: "var(--bg-2)", borderRadius: 6, overflow: "hidden", marginTop: 4 }}>
                    <div style={{ width: `${total ? (v / total) * 100 : 0}%`, height: "100%", background: "linear-gradient(90deg,var(--brand),#7aa2ff)" }} />
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </>
  );
}
