import { useState } from "react";
import { useStore, getState, SHEET_COLS, officeRollup } from "../../store";

const today = () => new Date().toISOString().slice(0, 10);

export default function OfficeSheet() {
  useStore();
  getState();
  const [date, setDate] = useState(today());
  const [scope, setScope] = useState("day"); // day | all
  const { perRep, grand } = officeRollup(scope === "day" ? date : null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Office Sheet</h1>
          <p>Every rep's street sheet, rolled up live — the state of the office.</p>
        </div>
        <div className="row">
          <select className="select" style={{ width: "auto" }} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="day">Single day</option>
            <option value="all">All time</option>
          </select>
          {scope === "day" && <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />}
        </div>
      </div>

      <div className="cards grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{grand.doors}</div><div className="l">Doors knocked</div></div>
        <div className="card stat"><div className="n">{grand.dm}</div><div className="l">Decision makers</div></div>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{grand.d}</div><div className="l">Deals</div></div>
        <div className="card stat"><div className="n">{grand.ni}</div><div className="l">Not interested</div></div>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Rep</th>
              <th style={{ textAlign: "center" }}>Doors</th>
              {SHEET_COLS.map((c) => <th key={c.key} title={c.title} style={{ textAlign: "center" }}>{c.lab}</th>)}
              <th style={{ textAlign: "center" }}>CB</th>
            </tr>
          </thead>
          <tbody>
            {perRep.map(({ rep, ...t }) => (
              <tr key={rep.id}>
                <td>{rep.name}</td>
                <td style={{ textAlign: "center" }}>{t.doors}</td>
                {SHEET_COLS.map((c) => <td key={c.key} style={{ textAlign: "center", color: c.key === "d" && t.d ? "var(--green)" : undefined, fontWeight: c.key === "d" && t.d ? 600 : 400 }}>{t[c.key]}</td>)}
                <td style={{ textAlign: "center" }}>{t.cb}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td>Office total</td>
              <td style={{ textAlign: "center" }}>{grand.doors}</td>
              {SHEET_COLS.map((c) => <td key={c.key} style={{ textAlign: "center" }}>{grand[c.key]}</td>)}
              <td style={{ textAlign: "center" }}>{grand.cb}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
