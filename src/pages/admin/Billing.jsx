import { useEffect, useState } from "react";
import { useStore, getState } from "../../store";
import { DEMO } from "../../supabaseClient";
import { loadBilling, addBillingCharge, addBillingPayment } from "../../api/services.js";
import Modal from "../../components/Modal.jsx";

// What the company owes, what it has paid, and a receipt for each payment.
// An admin-recorded ledger: no payment processor is involved, so nothing
// here moves money -- it records what happened elsewhere.

const money = (cents) =>
  "$" + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (ts) => new Date(ts).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
const METHODS = ["card", "ach", "check", "cash", "wire", "other"];

// Dollars typed by a human -> integer cents. Money is stored as cents so
// totals cannot drift the way repeated float addition does.
const toCents = (text) => {
  const n = Number(String(text).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const newReceiptNumber = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `R-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

export default function Billing() {
  useStore();
  const state = getState();
  const [charges, setCharges] = useState([]);
  const [payments, setPayments] = useState([]);
  const [absent, setAbsent] = useState(false);
  const [loading, setLoading] = useState(!DEMO);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null);   // 'charge' | 'payment'
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    if (DEMO) return;
    let live = true;
    loadBilling().then((r) => {
      if (!live) return;
      setCharges(r.charges); setPayments(r.payments); setAbsent(r.absent); setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const billed = charges.reduce((a, c) => a + c.cents, 0);
  const paid = payments.reduce((a, p) => a + p.cents, 0);
  const due = billed - paid;

  // Seat context, to size a monthly charge. Seats no longer carry an
  // individual price in Personnel, so this counts people rather than
  // quoting a total the admin never set.
  const billableSeats = state.users.filter((u) => ["rep", "manager"].includes(u.role) && u.status === "active").length;

  if (DEMO) {
    return (
      <>
        <div className="page-head"><div><h1>Billing</h1></div></div>
        <div className="card empty">Billing needs the live database — demo mode keeps no ledger.</div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Billing</h1>
          <p>What you owe, what you've paid, and a receipt for every payment. Recorded here — no card is charged by the app.</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => { setErr(""); setForm("charge"); }}>+ Record charge</button>
          <button className="btn primary" onClick={() => { setErr(""); setForm("payment"); }}>+ Record payment</button>
        </div>
      </div>

      {absent && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--amber)" }}>
          <p style={{ margin: 0, fontSize: 14 }}>The billing tables aren't in the database yet. Apply the campaigns and billing migration (0021) and this fills in.</p>
        </div>
      )}
      {err && <div className="err">{err}</div>}

      <div className="cards grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <div className="n" style={{ color: due > 0 ? "var(--red)" : "var(--green)" }}>{money(Math.max(0, due))}</div>
          <div className="l">{due > 0 ? "Currently due" : "Nothing due"}</div>
        </div>
        <div className="card stat"><div className="n">{money(billed)}</div><div className="l">Billed all time</div></div>
        <div className="card stat"><div className="n">{money(paid)}</div><div className="l">Paid all time</div></div>
        <div className="card stat"><div className="n">{billableSeats}</div><div className="l">Active rep / manager seats</div></div>
      </div>

      {due < 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--green)" }}>
          <p style={{ margin: 0, fontSize: 14 }}>You're {money(-due)} in credit — payments recorded exceed what's been billed.</p>
        </div>
      )}

      <div className="cards grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Billing history</h3>
          {loading ? <p className="muted">Loading…</p> : charges.length === 0 ? (
            <div className="empty">No charges recorded yet.</div>
          ) : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Description</th><th>Period</th><th>Due</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {charges.map((c) => (
                    <tr key={c.id}>
                      <td>{c.description}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {c.periodStart || c.periodEnd ? `${c.periodStart || "…"} → ${c.periodEnd || "…"}` : "—"}
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>{c.dueDate || "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{money(c.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Payments &amp; receipts</h3>
          {loading ? <p className="muted">Loading…</p> : payments.length === 0 ? (
            <div className="empty">No payments recorded yet.</div>
          ) : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Paid</th><th>Method</th><th style={{ textAlign: "right" }}>Amount</th><th></th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{day(p.paidAt)}</td>
                      <td className="muted" style={{ textTransform: "capitalize" }}>{p.method}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "var(--green)" }}>{money(p.cents)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn sm" onClick={() => setReceipt(p)}>Receipt</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {form && (
        <LedgerForm
          kind={form}
          seats={billableSeats}
          onClose={() => setForm(null)}
          onSaved={(r) => {
            if (r.charge) setCharges((c) => [r.charge, ...c]);
            if (r.payment) setPayments((p) => [r.payment, ...p]);
            setForm(null);
          }}
          onError={setErr}
        />
      )}

      {receipt && <Receipt payment={receipt} orgName={state.org.name} onClose={() => setReceipt(null)} />}
    </>
  );
}

function LedgerForm({ kind, seats, onClose, onSaved, onError }) {
  const isCharge = kind === "charge";
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState(isCharge ? `Subscription — ${seats} seat${seats === 1 ? "" : "s"}` : "");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] = useState("card");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const cents = toCents(amount);
    if (cents <= 0) return onError("Enter an amount greater than zero.");
    if (isCharge && !description.trim()) return onError("Give the charge a description.");
    setBusy(true);
    const r = isCharge
      ? await addBillingCharge({ description: description.trim(), cents, periodStart, periodEnd, dueDate })
      : await addBillingPayment({ cents, method, reference: reference.trim(), receiptNumber: newReceiptNumber() });
    setBusy(false);
    if (r.error) return onError(r.error);
    onError("");
    onSaved(r);
  };

  return (
    <Modal
      title={isCharge ? "Record a charge" : "Record a payment"}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </>}
    >
      <label className="field">
        <span>Amount (USD)</span>
        <input className="input" inputMode="decimal" value={amount} placeholder="0.00"
          onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>

      {isCharge ? (
        <>
          <label className="field">
            <span>Description</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Period start</span>
              <input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Period end</span>
              <input className="input" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Due date</span>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>Method</span>
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m} value={m} style={{ textTransform: "capitalize" }}>{m}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Reference <span className="muted">(optional)</span></span>
            <input className="input" value={reference} placeholder="Check number, transaction id…"
              onChange={(e) => setReference(e.target.value)} />
          </label>
        </>
      )}
    </Modal>
  );
}

function Receipt({ payment, orgName, onClose }) {
  return (
    <Modal
      title="Receipt"
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn primary" onClick={() => window.print()}>Print</button>
      </>}
    >
      <div className="receipt">
        <div className="row between">
          <b style={{ fontSize: 16 }}>{orgName || "Doorline"}</b>
          <span className="muted" style={{ fontFamily: "monospace" }}>{payment.receiptNumber}</span>
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, margin: "14px 0 4px", color: "var(--green)" }}>
          {money(payment.cents)}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>Paid {day(payment.paidAt)} by {payment.method}</div>
        {payment.reference && (
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Reference: {payment.reference}</div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
          This receipt records a payment entered by an administrator. No card was charged by Doorline.
        </p>
      </div>
    </Modal>
  );
}
