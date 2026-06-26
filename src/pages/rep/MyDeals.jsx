import { useStore, getState } from "../../store";

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
          <p>Everything you've closed.</p>
        </div>
      </div>

      <div className="cards grid-2" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{deals.length}</div><div className="l">Deals closed</div></div>
        <div className="card stat"><div className="n">${total.toLocaleString()}</div><div className="l">Total contract value</div></div>
      </div>

      <div className="card">
        {deals.length === 0 ? (
          <p className="muted">No deals yet. Mark a door "Sold" to capture one.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Product</th><th>Address</th><th style={{ textAlign: "right" }}>Value</th></tr></thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td>{d.customer}</td>
                  <td className="muted">{d.product}</td>
                  <td className="muted">{d.addr}</td>
                  <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>${(d.value || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
