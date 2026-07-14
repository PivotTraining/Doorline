import { useRef, useState } from "react";
import Modal from "./Modal.jsx";
import SignaturePad from "./SignaturePad.jsx";
import { updateDeal, activeCampaigns } from "../store";

const fmt = (ts) => new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// One deal's contract: view an existing signature, or capture a new one.
export default function ContractModal({ deal, onClose, readOnly = false }) {
  const campaign = activeCampaigns().find((c) => c.name === deal.product);
  const defaultTerms = deal.contractTerms || campaign?.description || "";
  const [name, setName] = useState(deal.signedName || deal.customer || "");
  const [terms, setTerms] = useState(defaultTerms);
  const [err, setErr] = useState("");
  const pad = useRef(null);

  const alreadySigned = !!deal.signedAt;

  const save = () => {
    if (readOnly) return;
    if (!name.trim()) return setErr("Enter the customer's name.");
    if (pad.current?.isEmpty()) return setErr("Please capture a signature.");
    updateDeal(deal.id, {
      signedName: name.trim(),
      signature: pad.current.toDataURL(),
      signedAt: Date.now(),
      contractTerms: terms || null,
    });
    onClose();
  };

  const clearSig = () => updateDeal(deal.id, { signature: null, signedName: null, signedAt: null });

  return (
    <Modal
      title={alreadySigned ? "Signed contract" : "Contract & signature"}
      onClose={onClose}
      width={560}
      footer={alreadySigned
        ? <>{!readOnly && <button className="btn ghost danger" onClick={() => { clearSig(); onClose(); }}>Void signature</button>}<button className="btn primary" onClick={onClose}>Close</button></>
        : <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save signed contract</button></>}
    >
      <div className="row between" style={{ marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <div><b>{deal.product || "Deal"}</b>{deal.value ? <span className="muted"> · ${Number(deal.value).toLocaleString()}</span> : null}</div>
        {deal.addr && <span className="muted" style={{ fontSize: 13 }}>{deal.addr}</span>}
      </div>

      <label className="field">
        <span>Customer name</span>
        <input className="input" value={name} disabled={alreadySigned || readOnly} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field">
        <span>Agreement / terms</span>
        <textarea className="input" rows={5} value={terms} disabled={alreadySigned || readOnly}
          placeholder="What the customer is agreeing to — pulled from the campaign, edit if needed."
          onChange={(e) => setTerms(e.target.value)} />
      </label>

      {err && <div className="err">{err}</div>}

      {alreadySigned ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <span>Signature</span>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "#fff", padding: 8 }}>
            {deal.signature
              ? <img src={deal.signature} alt="signature" style={{ maxWidth: "100%", display: "block" }} />
              : <span className="muted">Signature on file.</span>}
          </div>
          <small className="muted">Signed by {deal.signedName || "customer"} · {fmt(deal.signedAt)}</small>
        </div>
      ) : (
        <div className="field" style={{ marginBottom: 0 }}>
          <div className="row between">
            <span>Customer signature</span>
            <button className="btn sm ghost" type="button" onClick={() => pad.current?.clear()}>Clear</button>
          </div>
          <SignaturePad ref={pad} />
          <small className="muted">By signing, {name || "the customer"} agrees to the terms above.</small>
        </div>
      )}
    </Modal>
  );
}
