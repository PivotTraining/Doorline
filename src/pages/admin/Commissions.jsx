import { useState, useMemo } from "react";
import { useStore, getState, activeCampaigns } from "../../store";
import { repCode } from "../../lib/campaigns.js";
import { repEarnings, campaignByName, dealCommission } from "../../lib/commission.js";
import { downloadCSV } from "../../lib/csv.js";
import Modal from "../../components/Modal.jsx";

const money = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const RANGES = { week: "This week", month: "This month", all: "All time" };
const WEEK_MS = 7 * 86400e3, MONTH_MS = 30 * 86400e3;

export default function Commissions() {
  useStore();
  const state = getState();
  const campaigns = activeCampaigns();
  const reps = state.users.filter((u) => u.role === "rep" || u.role === "manager");
  const [range, setRange] = useState("month");
  const [openRep, setOpenRep] = useState(null);

  const cutoff = range === "week" ? Date.now() - WEEK_MS : range === "month" ? Date.now() - MONTH_MS : 0;
  const deals = useMemo(() => state.deals.filter((d) => (d.ts || 0) >= cutoff), [state.deals, cutoff]);
  const earnings = useMemo(() => repEarnings(deals, campaigns), [deals, campaigns]);
  const grand = [...earnings.values()].reduce((a, e) => ({ deals: a.deals + e.deals, value: a.value + e.value, commission: a.commission + e.commission }), { deals: 0, value: 0, commission: 0 });

  const anyCommission = campaigns.some((c) => Number(c.commissionAmount) > 0);

  const exportCSV = () => downloadCSV(`commissions-${range}.csv`, reps.map((r) => {
    const e = earnings.get(r.id) || { deals: 0, value: 0, commission: 0 };
    return { Rep: r.name, "Rep ID": repCode(r.id), Deals: e.deals, "Contract value": e.value.toFixed(2), "Commission owed": e.commission.toFixed(2) };
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Commissions</h1>
          <p>What each rep has earned, based on the commission you set per campaign. Track it here and pay however you already do — nothing moves money automatically.</p>
        </div>
        <div className="row">
          <select className="select" style={{ width: "auto" }} value={range} onChange={(e) => setRange(e.target.value)}>
            {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn" onClick={exportCSV}>⤓ Export CSV</button>
        </div>
      </div>

      {!anyCommission && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--amber)" }}>
          <p style={{ margin: 0, fontSize: 14 }}>💡 No campaign has a commission set yet, so everything below reads $0. Set a commission (flat $ or %) on each campaign under <b>Campaigns</b> and the numbers here fill in automatically.</p>
        </div>
      )}

      <div className="cards grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{grand.deals}</div><div className="l">Deals ({RANGES[range].toLowerCase()})</div></div>
        <div className="card stat"><div className="n">{money(grand.value)}</div><div className="l">Contract value</div></div>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{money(grand.commission)}</div><div className="l">Total commission owed</div></div>
        <div className="card stat"><div className="n">{reps.filter((r) => (earnings.get(r.id)?.commission || 0) > 0).length}</div><div className="l">Reps with earnings</div></div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>Rep</th><th>Rep ID</th><th style={{ textAlign: "center" }}>Deals</th><th style={{ textAlign: "right" }}>Contract value</th><th style={{ textAlign: "right" }}>Commission owed</th><th></th></tr></thead>
            <tbody>
              {reps.map((r) => {
                const e = earnings.get(r.id) || { deals: 0, value: 0, commission: 0 };
                return (
                  <tr key={r.id} className="rep-row" style={{ opacity: e.deals ? 1 : 0.5 }} onClick={() => e.deals && setOpenRep(r)}>
                    <td><span className={e.deals ? "rep-link" : undefined}>{r.name}</span></td>
                    <td className="muted" style={{ fontFamily: "monospace" }}>{repCode(r.id)}</td>
                    <td style={{ textAlign: "center" }}>{e.deals}</td>
                    <td style={{ textAlign: "right" }}>{money(e.value)}</td>
                    <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>{money(e.commission)}</td>
                    <td className="muted" style={{ textAlign: "right", fontSize: 12 }}>{e.deals ? "Details →" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td><td></td>
                <td style={{ textAlign: "center" }}>{grand.deals}</td>
                <td style={{ textAlign: "right" }}>{money(grand.value)}</td>
                <td style={{ textAlign: "right", color: "var(--green)" }}>{money(grand.commission)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {openRep && (
        <RepCommissionDetail rep={openRep} deals={deals.filter((d) => d.repId === openRep.id)} campaigns={campaigns} onClose={() => setOpenRep(null)} />
      )}
    </>
  );
}

function RepCommissionDetail({ rep, deals, campaigns, onClose }) {
  const campMap = campaignByName(campaigns);
  const sorted = [...deals].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const total = sorted.reduce((a, d) => a + dealCommission(d, campMap), 0);
  return (
    <Modal title={`${rep.name} · commission`} onClose={onClose} width={620}
      footer={<span style={{ fontWeight: 700 }}>Owed: <span style={{ color: "var(--green)" }}>{money(Math.round(total * 100) / 100)}</span></span>}>
      {sorted.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No deals in this period.</p>
      ) : (
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>When</th><th>Customer</th><th>Campaign</th><th style={{ textAlign: "right" }}>Value</th><th style={{ textAlign: "right" }}>Commission</th></tr></thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.id}>
                  <td className="muted" style={{ fontSize: 13 }}>{new Date(d.ts || Date.now()).toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                  <td>{d.customer || "—"}</td>
                  <td className="muted">{d.product || "—"}</td>
                  <td style={{ textAlign: "right" }}>{money(d.value)}</td>
                  <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 600 }}>{money(dealCommission(d, campMap))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
