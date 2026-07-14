import { useState } from "react";
import { useStore, getState } from "../../store";
import { downloadCSV, stamp } from "../../lib/csv.js";
import ContractModal from "../../components/ContractModal.jsx";

const WEEK_MS = 7 * 86400e3;

export default function Deals() {
  useStore();
  const state = getState();
  const [contract, setContract] = useState(null);
  const name = (id) => state.users.find((u) => u.id === id)?.name || "—";
  const exportCSV = () => downloadCSV(`deals-${stamp()}.csv`, state.deals.map((d) => ({
    Customer: d.customer, Rep: name(d.repId), Product: d.product, Address: d.addr || "", Value: d.value || 0,
    Signed: d.signedAt ? "Y" : "", "Signed by": d.signedName || "", "Signed at": d.signedAt ? new Date(d.signedAt).toISOString() : "",
    Date: d.ts ? new Date(d.ts).toISOString().slice(0, 10) : "",
  })));
  const total = state.deals.reduce((a, d) => a + (d.value || 0), 0);
  const avg = state.deals.length ? Math.round(total / state.deals.length) : 0;
  const weekCutoff = Date.now() - WEEK_MS;
  const weekDeals = state.deals.filter((d) => (d.ts || 0) >= weekCutoff);
  const weekTotal = weekDeals.reduce((a, d) => a + (d.value || 0), 0);

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
        <button className="btn" onClick={exportCSV} disabled={state.deals.length === 0}>⤓ Export CSV</button>
      </div>

      <div className="cards grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{weekDeals.length}</div><div className="l">This week</div></div>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>${weekTotal.toLocaleString()}</div><div className="l">This week's value</div></div>
        <div className="card stat"><div className="n">{state.deals.length}</div><div className="l">All-time deals</div></div>
        <div className="card stat"><div className="n">${total.toLocaleString()}</div><div className="l">All-time value</div></div>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: -10, marginBottom: 18 }}>Avg deal size: ${avg.toLocaleString()}</p>

      <div className="cards grid-2">
        <div className="card">
          <h3>All deals</h3>
          {state.deals.length === 0 ? (
            <p className="muted">No deals closed yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Customer</th><th>Rep</th><th>Product</th><th style={{ textAlign: "right" }}>Value</th><th>Contract</th></tr></thead>
                <tbody>
                  {state.deals.map((d) => (
                    <tr key={d.id}>
                      <td>{d.customer}</td>
                      <td className="muted">{name(d.repId)}</td>
                      <td className="muted">{d.product}</td>
                      <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>${(d.value || 0).toLocaleString()}</td>
                      <td>
                        {d.signedAt
                          ? <button className="btn sm" onClick={() => setContract(d)}><span className="dot" style={{ background: "var(--green)" }} /> View</button>
                          : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {contract && <ContractModal deal={state.deals.find((d) => d.id === contract.id) || contract} onClose={() => setContract(null)} readOnly />}
    </>
  );
}
