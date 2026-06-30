import { useState, useCallback, memo } from "react";
import { useStore, getState, SHEET_COLS, addStreetRow, updateStreetRow, removeStreetRow, sheetTotals, submitDay, reopenDay, isDaySubmitted } from "../../store";

const SLOTS = 100;
const today = () => new Date().toISOString().slice(0, 10);
const cellStyle = { padding: "4px 6px", borderBottom: "1px solid var(--border)", textAlign: "center" };
const pad = { padding: "6px 8px" };

// A worked slot: existing row. Primitive props + stable callbacks → only the edited row repaints.
const SheetRow = memo(function SheetRow({ id, slot, street, nh, rl, dm, bid, d, ni, customer, phone, comments, cb, onSet, onRemove }) {
  const flags = { nh, rl, dm, bid, d, ni };
  return (
    <tr>
      <td className="muted" style={{ textAlign: "center" }}>{slot}</td>
      <td><input className="input" style={pad} value={street} placeholder="580 Noah Ave" onChange={(e) => onSet(id, { street: e.target.value })} /></td>
      {SHEET_COLS.map((c) => (
        <td key={c.key} style={cellStyle}>
          <input type="checkbox" checked={!!flags[c.key]} onChange={(e) => onSet(id, { [c.key]: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} />
        </td>
      ))}
      <td><input className="input" style={pad} value={customer} onChange={(e) => onSet(id, { customer: e.target.value })} /></td>
      <td><input className="input" style={pad} type="tel" value={phone} placeholder="phone → nudge" onChange={(e) => onSet(id, { phone: e.target.value })} /></td>
      <td><input className="input" style={pad} value={comments} onChange={(e) => onSet(id, { comments: e.target.value })} /></td>
      <td><input className="input" style={pad} value={cb} placeholder="5:30" onChange={(e) => onSet(id, { cb: e.target.value })} /></td>
      <td><button className="x" title="Clear" onClick={() => onRemove(id)}>×</button></td>
    </tr>
  );
});

// An empty slot: holds local text until committed (on blur, or immediately on a
// disposition checkbox), so a slot only becomes a real "knocked" door once worked.
const EmptyRow = memo(function EmptyRow({ slot, onCreate }) {
  const [v, setV] = useState({ street: "", customer: "", phone: "", comments: "", cb: "" });
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const commit = () => { if (Object.values(v).some((x) => x.trim())) onCreate(slot, { ...v }); };
  const flag = (key) => onCreate(slot, { ...v, [key]: true });
  return (
    <tr style={{ opacity: 0.92 }}>
      <td className="muted" style={{ textAlign: "center" }}>{slot}</td>
      <td><input className="input" style={pad} value={v.street} onChange={set("street")} onBlur={commit} /></td>
      {SHEET_COLS.map((c) => (
        <td key={c.key} style={cellStyle}>
          <input type="checkbox" checked={false} onChange={() => flag(c.key)} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} />
        </td>
      ))}
      <td><input className="input" style={pad} value={v.customer} onChange={set("customer")} onBlur={commit} /></td>
      <td><input className="input" style={pad} type="tel" value={v.phone} onChange={set("phone")} onBlur={commit} /></td>
      <td><input className="input" style={pad} value={v.comments} onChange={set("comments")} onBlur={commit} /></td>
      <td><input className="input" style={pad} value={v.cb} onChange={set("cb")} onBlur={commit} /></td>
      <td></td>
    </tr>
  );
});

export default function StreetSheet({ user }) {
  useStore();
  const state = getState();
  const [date, setDate] = useState(today());
  const rows = state.streetRows.filter((r) => r.repId === user.id && r.date === date);
  const t = sheetTotals(rows);
  const submitted = isDaySubmitted(user.id, date);

  const onSet = useCallback((id, patch) => updateStreetRow(id, patch), []);
  const onRemove = useCallback((id) => removeStreetRow(id), []);
  const onCreate = useCallback((slot, patch) => addStreetRow({ repId: user.id, date, slot, ...patch }), [user.id, date]);

  // Place worked rows by their slot; lay everything else out across 100 slots.
  const bySlot = {};
  const noSlot = [];
  rows.forEach((r) => (r.slot ? (bySlot[r.slot] = r) : noSlot.push(r)));
  let n = 1; noSlot.forEach((r) => { while (bySlot[n]) n++; bySlot[n] = r; n++; });
  const maxSlot = Math.max(SLOTS, ...Object.keys(bySlot).map(Number), 0);

  const complete = () => {
    if (confirm(`Complete ${date}'s sheet? You can reopen it if needed. Tomorrow starts a fresh sheet.`)) submitDay(user.id, date);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Street Sheet</h1>
          <p>Work top-to-bottom. Mark a disposition on a slot and it counts as knocked — totals roll up to your manager.</p>
        </div>
        <div className="row">
          <label className="field" style={{ margin: 0 }}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
          </label>
          {submitted
            ? <><span className="pill"><span className="dot" style={{ background: "var(--green)" }} /> Submitted</span><button className="btn" onClick={() => reopenDay(user.id, date)}>Reopen</button></>
            : <button className="btn primary" onClick={complete} disabled={t.doors === 0}>✓ Complete day</button>}
        </div>
      </div>

      <div className="cards grid-4" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="n">{t.doors}</div><div className="l">Doors knocked</div></div>
        <div className="card stat"><div className="n">{t.dm}</div><div className="l">Decision makers</div></div>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{t.d}</div><div className="l">Deals</div></div>
        <div className="card stat"><div className="n">{t.ni}</div><div className="l">Not interested</div></div>
      </div>

      <div className="card" style={{ overflowX: "auto", opacity: submitted ? 0.85 : 1 }}>
        <table className="tbl" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ minWidth: 130 }}>Street / #</th>
              {SHEET_COLS.map((c) => <th key={c.key} title={c.title} style={{ textAlign: "center", width: 46 }}>{c.lab}</th>)}
              <th style={{ minWidth: 120 }}>Customer</th>
              <th style={{ minWidth: 130 }}>Phone</th>
              <th style={{ minWidth: 150 }}>Comments</th>
              <th style={{ width: 70 }}>CB</th>
              <th style={{ width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxSlot }).map((_, i) => {
              const slot = i + 1;
              const r = bySlot[slot];
              return r ? (
                <SheetRow key={r.id} id={r.id} slot={slot} street={r.street}
                  nh={r.nh} rl={r.rl} dm={r.dm} bid={r.bid} d={r.d} ni={r.ni}
                  customer={r.customer} phone={r.phone} comments={r.comments} cb={r.cb} onSet={onSet} onRemove={onRemove} />
              ) : (
                <EmptyRow key={"e" + slot} slot={slot} onCreate={onCreate} />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        <b>Key:</b> NH Not Home · RL Reloop · DM Decision Maker · B/ID Bill or ID · D Deal (→ My Deals) · NI Not Interested · CB Call Back
      </p>
    </>
  );
}
