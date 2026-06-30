import { useStore, getState, updateDeal, PRODUCTS } from "../../store";

export default function MyDeals({ user }) {
  useStore();
  const state = getState();
  const deals = state.deals.filter((d) => d.repId === user.id);
  const total = deals.reduce((a, d) => a + (d.value || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Deals</h1>
          <p>Everything you've closed — including “D” from your Street Sheet. Set the product and contract value here.</p>
        </div>
      </div>

      <div className="cards grid-2" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{deals.length}</div><div className="l">Deals closed</div></div>
        <div className="card stat"><div className="n">${total.toLocaleString()}</div><div className="l">Total contract value</div></div>
      </div>

      <div className="card">
        {deals.length === 0 ? (
          <p className="muted">No deals yet. Mark “D” on the Street Sheet or “Sold” on a door to capture one.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Product</th><th>Address</th><th style={{ width: 150 }}>Value ($)</th></tr></thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td><input className="input" style={{ padding: "6px 8px" }} value={d.customer || ""} onChange={(e) => updateDeal(d.id, { customer: e.target.value })} /></td>
                  <td>
                    <select className="select" style={{ padding: "6px 8px" }} value={d.product || PRODUCTS[0]} onChange={(e) => updateDeal(d.id, { product: e.target.value })}>
                      {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="muted">{d.addr || "—"}</td>
                  <td>
                    <input className="input" style={{ padding: "6px 8px" }} type="number" min="0" value={d.value || 0}
                      onChange={(e) => updateDeal(d.id, { value: Math.max(0, Number(e.target.value) || 0) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
