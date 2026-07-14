import { useStore, getState, updateDeal, activeProducts, activeCampaigns } from "../../store";
import { campaignByName, dealCommission } from "../../lib/commission.js";

const WEEK_MS = 7 * 86400e3;
const money2 = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MyDeals({ user }) {
  useStore();
  const state = getState();
  const products = activeProducts();
  const campMap = campaignByName(activeCampaigns());
  const hasCommission = activeCampaigns().some((c) => Number(c.commissionAmount) > 0);
  const deals = state.deals.filter((d) => d.repId === user.id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const total = deals.reduce((a, d) => a + (d.value || 0), 0);
  const weekCutoff = Date.now() - WEEK_MS;
  const weekDeals = deals.filter((d) => (d.ts || 0) >= weekCutoff);
  const weekTotal = weekDeals.reduce((a, d) => a + (d.value || 0), 0);
  const weekComm = weekDeals.reduce((a, d) => a + dealCommission(d, campMap), 0);
  const allComm = deals.reduce((a, d) => a + dealCommission(d, campMap), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Deals</h1>
          <p>Everything you've closed — including “D” from your Street Sheet. Set the product and contract value here.</p>
        </div>
      </div>

      <div className="cards grid-4" style={{ marginBottom: hasCommission ? 12 : 18 }}>
        <div className="card stat"><div className="n">{weekDeals.length}</div><div className="l">This week</div></div>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>${weekTotal.toLocaleString()}</div><div className="l">This week's value</div></div>
        <div className="card stat"><div className="n">{deals.length}</div><div className="l">All-time deals</div></div>
        <div className="card stat"><div className="n">${total.toLocaleString()}</div><div className="l">All-time value</div></div>
      </div>

      {hasCommission && (
        <div className="cards grid-2" style={{ marginBottom: 18 }}>
          <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{money2(weekComm)}</div><div className="l">Commission this week</div></div>
          <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{money2(allComm)}</div><div className="l">Commission all-time</div></div>
        </div>
      )}

      <div className="card">
        {deals.length === 0 ? (
          <p className="muted">No deals yet. Mark “D” on the Street Sheet or “Sold” on a door to capture one.</p>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Product</th><th>Address</th><th style={{ width: 150 }}>Value ($)</th>{hasCommission && <th style={{ width: 110, textAlign: "right" }}>Commission</th>}<th style={{ width: 100 }}>When</th></tr></thead>
              <tbody>
                {deals.map((d) => {
                  const isThisWeek = (d.ts || 0) >= weekCutoff;
                  return (
                    <tr key={d.id}>
                      <td><input className="input" style={{ padding: "6px 8px" }} value={d.customer || ""} onChange={(e) => updateDeal(d.id, { customer: e.target.value })} /></td>
                      <td>
                        <select className="select" style={{ padding: "6px 8px" }} value={d.product || products[0]} onChange={(e) => updateDeal(d.id, { product: e.target.value })}>
                          {products.map((p) => <option key={p}>{p}</option>)}
                        </select>
                      </td>
                      <td className="muted">{d.addr || "—"}</td>
                      <td>
                        <input className="input" style={{ padding: "6px 8px" }} type="number" min="0" value={d.value || 0}
                          onChange={(e) => updateDeal(d.id, { value: Math.max(0, Number(e.target.value) || 0) })} />
                      </td>
                      {hasCommission && <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>{money2(dealCommission(d, campMap))}</td>}
                      <td>
                        {isThisWeek
                          ? <span className="tag" style={{ borderColor: "var(--brand)", color: "var(--brand)" }}>This week</span>
                          : <span className="muted" style={{ fontSize: 12 }}>{new Date(d.ts || Date.now()).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
