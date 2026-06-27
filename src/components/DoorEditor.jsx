import { useState } from "react";
import Modal from "./Modal.jsx";
import { DISPOS, PRODUCTS, ACTIONS, ACTION_LAB, setDoor, logActivity } from "../store";

const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Disposition + deal capture for a single door.
// Picking "Sold" reveals the deal form; saving writes through the store.
const OUTCOMES = ["nothome", "callback", "appt", "notint", "sold", "dnc"];

export default function DoorEditor({ door, onClose }) {
  const [status, setStatus] = useState(door.status === "untouched" ? "" : door.status);
  const [notes, setNotes] = useState(door.notes || "");
  const [contact, setContact] = useState(door.contact || "");
  const [phone, setPhone] = useState(door.phone || "");
  const [due, setDue] = useState(door.due || "");
  const [deal, setDeal] = useState(door.deal || { customer: "", product: PRODUCTS[0], value: "" });
  const [acts, setActs] = useState(door.activity || []);

  const quick = (key) => {
    logActivity(door.id, key);
    setActs((a) => [...a, { type: key, ts: Date.now() }]);
  };

  const save = () => {
    const fields = { status: status || "untouched", notes, contact, phone, due };
    if (status === "sold" && !door.deal) {
      fields.deal = { customer: deal.customer, product: deal.product, value: Number(deal.value) || 0 };
    }
    setDoor(door.id, fields);
    onClose();
  };

  return (
    <Modal
      title={door.addr || "Door"}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!status}>Save</button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        {door.lat.toFixed(5)}, {door.lng.toFixed(5)}
      </p>

      <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Quick log</span>
      <div className="row" style={{ marginBottom: acts.length ? 10 : 14 }}>
        {ACTIONS.map((a) => (
          <button key={a.key} className="btn sm" onClick={() => quick(a.key)}>
            <span className="dot" style={{ background: a.hex }} /> {a.lab}
          </button>
        ))}
      </div>
      {acts.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 14, display: "grid", gap: 2 }}>
          {acts.map((a, i) => (
            <div key={i}>• {ACTION_LAB[a.type]?.lab || a.type} <span style={{ opacity: 0.7 }}>· {fmtTime(a.ts)}</span></div>
          ))}
        </div>
      )}

      <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Outcome</span>
      <div className="row" style={{ marginBottom: 14 }}>
        {OUTCOMES.map((k) => (
          <button
            key={k}
            className="btn sm"
            onClick={() => setStatus(k)}
            style={status === k ? { borderColor: DISPOS[k].hex, background: DISPOS[k].hex + "22", color: "#fff" } : undefined}
          >
            <span className="dot" style={{ background: DISPOS[k].hex }} /> {DISPOS[k].lab}
          </button>
        ))}
      </div>

      {status === "sold" && !door.deal && (
        <div className="card" style={{ marginBottom: 14, background: "var(--bg-2)" }}>
          <strong style={{ display: "block", marginBottom: 10 }}>💰 New deal</strong>
          <label className="field">
            <span>Customer</span>
            <input className="input" value={deal.customer} onChange={(e) => setDeal({ ...deal, customer: e.target.value })} placeholder="Customer name" />
          </label>
          <label className="field">
            <span>Product</span>
            <select className="select" value={deal.product} onChange={(e) => setDeal({ ...deal, product: e.target.value })}>
              {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Contract value ($)</span>
            <input className="input" type="number" min="0" value={deal.value} onChange={(e) => setDeal({ ...deal, value: e.target.value })} placeholder="12000" />
          </label>
        </div>
      )}
      {door.deal && (
        <div className="card" style={{ marginBottom: 14, background: "var(--bg-2)" }}>
          <strong>Deal on file</strong>
          <div className="muted" style={{ fontSize: 13 }}>{door.deal.customer} · {door.deal.product} · ${door.deal.value.toLocaleString()}</div>
        </div>
      )}

      <label className="field">
        <span>Contact name</span>
        <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Who you spoke to" />
      </label>
      <label className="field">
        <span>Phone</span>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
      </label>
      {(status === "callback" || status === "appt") && (
        <label className="field">
          <span>Follow-up date</span>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      )}
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Notes</span>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened at the door…" />
      </label>
    </Modal>
  );
}
