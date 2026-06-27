import { useState, useCallback, memo } from "react";
import { useStore, getState, SHEET_COLS, addStreetRow, updateStreetRow, removeStreetRow, sheetTotals } from "../../store";

const today = () => new Date().toISOString().slice(0, 10);
const cellStyle = { padding: "4px 6px", borderBottom: "1px solid var(--border)", textAlign: "center" };

// Memoized row: all props are primitives + stable callbacks, so the default
// shallow comparison re-renders only the row whose values actually changed.
// (We can't pass the row object — the store mutates it in place, so its ref
// never changes and memo would skip real updates.)
const SheetRow = memo(function SheetRow({ id, idx, street, nh, rl, dm, bid, d, ni, customer, comments, cb, onSet, onRemove }) {
  const flags = { nh, rl, dm, bid, d, ni };
  return (
    <tr>
      <td className="muted" style={{ textAlign: "center" }}>{idx + 1}</td>
      <td><input className="input" style={{ padding: "6px 8px" }} value={street} placeholder="580 Noah Ave" onChange={(e) => onSet(id, { street: e.target.value })} /></td>
      {SHEET_COLS.map((c) => (
        <td key={c.key} style={cellStyle}>
          <input type="checkbox" checked={!!flags[c.key]} onChange={(e) => onSet(id, { [c.key]: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} />
        </td>
      ))}
      <td><input className="input" style={{ padding: "6px 8px" }} value={customer} onChange={(e) => onSet(id, { customer: e.target.value })} /></td>
      <td><input className="input" style={{ padding: "6px 8px" }} value={comments} onChange={(e) => onSet(id, { comments: e.target.value })} /></td>
      <td><input className="input" style={{ padding: "6px 8px" }} value={cb} placeholder="5:30" onChange={(e) => onSet(id, { cb: e.target.value })} /></td>
      <td><button className="x" title="Remove" onClick={() => onRemove(id)}>×</button></td>
    </tr>
  );
});

export default function StreetSheet({ user }) {
  useStore();
  const state = getState();
  const [date, setDate] = useState(today());
  const rows = state.streetRows.filter((r) => r.repId === user.id && r.date === date);
  const t = sheetTotals(rows);

  const onSet = useCallback((id, patch) => updateStreetRow(id, patch), []);
  const onRemove = useCallback((id) => removeStreetRow(id), []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Street Sheet</h1>
          <p>Work the street top-to-bottom. Tap a column per door — totals roll up to your manager automatically.</p>
        </div>
        <div className="row">
          <label className="field" style={{ margin: 0 }}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
          </label>
          <button className="btn primary" onClick={() => addStreetRow({ repId: user.id, date, street: "" })}>+ Add door</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th style={{ minWidth: 130 }}>Street / #</th>
              {SHEET_COLS.map((c) => <th key={c.key} title={c.title} style={{ textAlign: "center", width: 46 }}>{c.lab}</th>)}
              <th style={{ minWidth: 120 }}>Customer</th>
              <th style={{ minWidth: 160 }}>Comments</th>
              <th style={{ width: 70 }}>CB</th>
              <th style={{ width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={SHEET_COLS.length + 5} className="muted" style={{ padding: 16 }}>No doors yet — tap “Add door” to start the street.</td></tr>
            )}
            {rows.map((r, i) => (
              <SheetRow key={r.id} id={r.id} idx={i} street={r.street}
                nh={r.nh} rl={r.rl} dm={r.dm} bid={r.bid} d={r.d} ni={r.ni}
                customer={r.customer} comments={r.comments} cb={r.cb} onSet={onSet} onRemove={onRemove} />
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td></td>
              <td>Totals · {t.doors} doors</td>
              {SHEET_COLS.map((c) => <td key={c.key} style={{ textAlign: "center" }}>{t[c.key]}</td>)}
              <td></td><td></td>
              <td style={{ textAlign: "center" }}>{t.cb}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        <b>Key:</b> NH Not Home · RL Reloop · DM Decision Maker · B/ID Bill or ID · D Deal · NI Not Interested · CB Call Back
      </p>
    </>
  );
}
