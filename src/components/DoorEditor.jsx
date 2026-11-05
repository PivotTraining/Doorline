import { useState } from "react";
import Modal from "./Modal.jsx";
import { DISPOS, activeProducts, ACTIONS, ACTION_LAB, setDoor, logActivity } from "../store";

// Activity stamps carry a DATE, not just a clock time. A door gets worked
// across multiple passes, and "3:42 PM" with no day made last week's knock
// indistinguishable from this morning's -- the exact question a rep opens
// this panel to answer.
const fmtWhen = (ts) => {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const yday = new Date(now); yday.setDate(now.getDate() - 1);
  if (d.toDateString() === yday.toDateString()) return `Yesterday ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${d.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })} ${time}`;
};

// Disposition + deal capture for a single door.
// Picking "Sold" reveals the deal form; saving writes through the store.
const OUTCOMES = ["nothome", "callback", "appt", "notint", "sold", "dnc"];

export default function DoorEditor({ door, onClose }) {
  const products = activeProducts();
  const [status, setStatus] = useState(door.status === "untouched" ? "" : door.status);
  const [notes, setNotes] = useState(door.notes || "");
  const [contact, setContact] = useState(door.contact || "");
  const [ownerName, setOwnerName] = useState(door.ownerName || "");
  const [serviced, setServiced] = useState(!!door.serviced);
  const [phone, setPhone] = useState(door.phone || "");
  const [due, setDue] = useState(door.due || "");
  const [deal, setDeal] = useState(door.deal || { customer: "", product: products[0], value: "" });
  const [acts, setActs] = useState(door.activity || []);

  const quick = (key) => {
    logActivity(door.id, key);
    setActs((a) => [...a, { type: key, ts: Date.now() }]);
  };

  const save = () => {
    const fields = { status: status || "untouched", notes, contact, phone, due, ownerName, serviced };
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
      {/* Who lives here, read before the knock — the single most useful thing
          to have on screen when the door opens. */}
      {ownerName && (
        <p style={{ margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
          {ownerName}
        </p>
      )}
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        {door.lat.toFixed(5)}, {door.lng.toFixed(5)}
      </p>

      {/* Already on the books. Distinct from "sold" (which means this rep
          closed it on this pass) and it survives re-loops, so a rep doesn't
          pitch an existing customer. */}
      {serviced && (
        <div className="card" style={{ marginBottom: 14, background: "var(--bg-2)", padding: "8px 12px" }}>
          <strong style={{ fontSize: 13 }}>✅ Already a customer</strong>
          <div className="muted" style={{ fontSize: 12 }}>This address is already served — check before pitching.</div>
        </div>
      )}

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
            <div key={i}>• {ACTION_LAB[a.type]?.lab || a.type} <span style={{ opacity: 0.7 }}>· {fmtWhen(a.ts)}</span></div>
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
              {products.map((p) => <option key={p}>{p}</option>)}
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

      {/* Owner vs contact are deliberately separate: the owner is who the
          property record says lives here (imported ahead of the knock), the
          contact is whoever actually answered the door. */}
      <label className="field">
        <span>Homeowner</span>
        <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="On the property record" />
      </label>
      <label className="field">
        <span>Contact name</span>
        <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Who you spoke to" />
      </label>
      <label className="row" style={{ alignItems: "center", gap: 8, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={serviced} onChange={(e) => setServiced(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Already a customer (don't pitch)</span>
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
