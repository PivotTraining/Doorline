import { useState } from "react";
import { useStore, getState, activeCampaigns, setOrgCampaigns } from "../../store";
import { personalizedEnrollUrl } from "../../lib/campaigns.js";
import Modal from "../../components/Modal.jsx";

const blank = () => ({ id: "c" + Math.random().toString(36).slice(2, 9), name: "", description: "", promo: "", enrollmentUrl: "", active: true, commissionType: "flat", commissionAmount: 0 });
const commissionLabel = (c) => {
  const amt = Number(c.commissionAmount) || 0;
  if (amt <= 0) return null;
  return c.commissionType === "percent" ? `${amt}% of contract` : `$${amt} per deal`;
};

export default function Campaigns() {
  useStore();
  getState();
  const campaigns = activeCampaigns();
  const [edit, setEdit] = useState(null); // campaign being edited/added

  const save = () => {
    const c = edit;
    if (!c.name.trim()) return;
    const rest = campaigns.filter((x) => x.id !== c.id);
    setOrgCampaigns([...rest, { ...c, name: c.name.trim() }]);
    setEdit(null);
  };
  const remove = (id) => { if (confirm("Remove this campaign? Reps will no longer see it.")) setOrgCampaigns(campaigns.filter((c) => c.id !== id)); };
  const toggle = (id) => setOrgCampaigns(campaigns.map((c) => c.id === id ? { ...c, active: !c.active } : c));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <p>What your reps are selling — the full breakdown, current promos, and a personalized enrollment link per rep. This is what shows on each rep's Campaigns screen.</p>
        </div>
        <button className="btn primary" onClick={() => setEdit(blank())}>+ New campaign</button>
      </div>

      {campaigns.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No campaigns yet. Add your first one so reps have something to pitch and enroll customers into.</p></div>
      ) : (
        <div className="cards grid-2">
          {campaigns.map((c) => (
            <div key={c.id} className="card" style={{ opacity: c.active ? 1 : 0.6 }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <h3 style={{ margin: 0 }}>{c.name || <span className="muted">Untitled</span>}</h3>
                <span className="pill"><span className="dot" style={{ background: c.active ? "var(--green)" : "var(--muted)" }} /> {c.active ? "Live" : "Off"}</span>
              </div>
              <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {c.promo && <span className="tag" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>🏷 {c.promo}</span>}
                {commissionLabel(c) && <span className="tag" style={{ borderColor: "var(--green)", color: "var(--green)" }}>💵 {commissionLabel(c)}</span>}
              </div>
              {c.description && <p className="muted" style={{ fontSize: 13, marginBottom: 8, whiteSpace: "pre-wrap" }}>{c.description}</p>}
              {c.enrollmentUrl && (
                <p className="muted" style={{ fontSize: 12, marginBottom: 8, wordBreak: "break-all" }}>
                  🔗 {c.enrollmentUrl}
                  <br /><span style={{ opacity: 0.7 }}>Rep sees, e.g.: {personalizedEnrollUrl(c.enrollmentUrl, "7A3F9C")}</span>
                </p>
              )}
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <button className="btn sm" onClick={() => setEdit({ ...c })}>Edit</button>
                <button className="btn sm" onClick={() => toggle(c.id)}>{c.active ? "Turn off" : "Turn on"}</button>
                <button className="btn sm danger" onClick={() => remove(c.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <Modal
          title={campaigns.some((c) => c.id === edit.id) ? "Edit campaign" : "New campaign"}
          onClose={() => setEdit(null)}
          width={560}
          footer={<><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={!edit.name.trim()}>Save</button></>}
        >
          <label className="field">
            <span>Campaign name</span>
            <input className="input" value={edit.name} placeholder="e.g. Dual Fuel — Gas & Electric" onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <small className="muted">Shown to reps and used as the product on closed deals.</small>
          </label>
          <label className="field">
            <span>Current promo <span className="muted">(optional)</span></span>
            <input className="input" value={edit.promo} placeholder="e.g. First month free + $50 gift card" onChange={(e) => setEdit({ ...edit, promo: e.target.value })} />
          </label>
          <label className="field">
            <span>Full breakdown</span>
            <textarea className="input" rows={5} value={edit.description} placeholder="Exactly what this campaign is — rates, terms, what to say at the door, who qualifies…" onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </label>
          <label className="field">
            <span>Enrollment link <span className="muted">(optional)</span></span>
            <input className="input" value={edit.enrollmentUrl} placeholder="https://enroll.example.com?agent={code}" onChange={(e) => setEdit({ ...edit, enrollmentUrl: e.target.value })} />
            <small className="muted">Put <code>{"{code}"}</code> where the rep's ID goes and each rep gets their own tagged link. No placeholder? We append <code>?ref=THEIRID</code> automatically.</small>
          </label>
          <div className="field" style={{ marginBottom: 0 }}>
            <span>Rep commission <span className="muted">(optional)</span></span>
            <div className="row" style={{ gap: 8 }}>
              <select className="select" style={{ width: "auto" }} value={edit.commissionType} onChange={(e) => setEdit({ ...edit, commissionType: e.target.value })}>
                <option value="flat">$ per deal</option>
                <option value="percent">% of contract</option>
              </select>
              <input className="input" type="number" min="0" step="0.01" style={{ maxWidth: 130 }} value={edit.commissionAmount}
                placeholder={edit.commissionType === "percent" ? "e.g. 10" : "e.g. 150"}
                onChange={(e) => setEdit({ ...edit, commissionAmount: e.target.value })} />
              <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>{edit.commissionType === "percent" ? "% of each deal's value" : "per closed deal"}</span>
            </div>
            <small className="muted">Used to calculate what each rep is owed on the Commissions page. Leave 0 if you track pay another way.</small>
          </div>
        </Modal>
      )}
    </>
  );
}
