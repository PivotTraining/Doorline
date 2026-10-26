import { useMemo, useState } from "react";
import { getState, useStore, sheetTotals, SHEET_COLS } from "../../store";
import { downloadCSV } from "../../lib/csv.js";
import { localDay } from "../../lib/date.js";

// Dispositions are entered once in the street sheet; managers receive the
// same underlying records plus a durable submission receipt and shift notes.
export default function DailyCloseouts() {
  useStore();
  const state = getState();
  const [date, setDate] = useState(localDay());
  const reps = state.users.filter((u) => u.role === "rep");
  const summary = useMemo(() => reps.map((rep) => {
    const rows = state.streetRows.filter((r) => r.repId === rep.id && r.date === date);
    const receipt = state.submittedDays[`${rep.id}|${date}`] || null;
    return { rep, rows, receipt, totals: sheetTotals(rows) };
  }), [state.streetRows, state.submittedDays, state.users, date]);
  const submitted = summary.filter((s) => s.receipt).length;
  const all = state.streetRows.filter((r) => r.date === date && reps.some((u) => u.id === r.repId));
  const totals = sheetTotals(all);
  const exportAll = () => {
    const records = summary.flatMap(({ rep, rows, receipt }) => rows.map((r) => ({
      Date: date, Agent: rep.name, Email: rep.email, Status: receipt ? "Submitted" : "In progress",
      Slot: r.slot || "", Street: r.street, "Not Home": r.nh ? 1 : 0,
      Reloop: r.rl ? 1 : 0, "Decision Maker": r.dm ? 1 : 0,
      "Bill/ID": r.bid ? 1 : 0, Deal: r.d ? 1 : 0,
      "Not Interested": r.ni ? 1 : 0, "Not Qualified": r.nq ? 1 : 0,
      Customer: r.customer, Phone: r.phone, Comments: r.comments,
      Callback: r.cb, "Shift Notes": receipt?.notes || "",
      "Submitted At": receipt?.submittedAt ? new Date(receipt.submittedAt).toISOString() : "",
    })));
    downloadCSV(`doorline-daily-closeout-${date}.csv`, records);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Daily Closeouts</h1>
          <p>One company-wide report built from each agent's street sheet. Track submissions, dispositions and follow-ups without asking agents to reenter data.</p>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <input aria-label="Report date" className="input" type="date" style={{ width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn primary" onClick={exportAll} disabled={all.length === 0}>↓ Export company CSV</button>
        </div>
      </div>
      <div className="cards grid-4" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="n">{submitted}/{reps.length}</div><div className="l">Agents submitted</div></div>
        <div className="card stat"><div className="n">{totals.doors}</div><div className="l">Doors worked</div></div>
        <div className="card stat"><div className="n">{totals.d}</div><div className="l">Deals</div></div>
        <div className="card stat"><div className="n">{totals.cb}</div><div className="l">Callbacks</div></div>
      </div>
      <div className="card">
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Agent</th><th>Status</th><th>Doors</th>
                {SHEET_COLS.map((c) => <th key={c.key} title={c.title}>{c.lab}</th>)}
                <th>Callbacks</th><th>Closeout time</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(({ rep, totals: t, receipt }) => (
                <tr key={rep.id}>
                  <td>{rep.name}</td>
                  <td><span className="pill">{receipt ? "✓ Submitted" : "In progress"}</span></td>
                  <td>{t.doors}</td>
                  {SHEET_COLS.map((c) => <td key={c.key}>{t[c.key]}</td>)}
                  <td>{t.cb}</td>
                  <td className="muted">{receipt?.submittedAt ? new Date(receipt.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {reps.length === 0 && <p className="muted">No field agents have joined this company yet.</p>}
      </div>
      {summary.filter((x) => x.receipt?.notes).length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Manager notes from submitted closeouts</h3>
          {summary.filter((x) => x.receipt?.notes).map(({ rep, receipt }) => (
            <div key={rep.id} style={{ marginBottom: 12 }}>
              <b>{rep.name}</b><p style={{ whiteSpace: "pre-wrap", margin: "4px 0" }}>{receipt.notes}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
