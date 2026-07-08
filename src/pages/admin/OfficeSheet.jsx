import { useState, useEffect, useRef } from "react";
import { useStore, getState, SHEET_COLS, officeRollup } from "../../store";
import { downloadCSV, stamp } from "../../lib/csv.js";
import { localDay } from "../../lib/date.js";
import { DEMO } from "../../supabaseClient";
import { initLive } from "../../api/bootstrap";
import Modal from "../../components/Modal.jsx";
import PullToRefresh from "../../components/PullToRefresh.jsx";

const today = () => localDay();
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export default function OfficeSheet() {
  useStore();
  const state = getState();
  const [date, setDate] = useState(today());
  const [scope, setScope] = useState("day"); // day | all
  const [openRep, setOpenRep] = useState(null); // rep being drilled into
  const [refreshing, setRefreshing] = useState(false);
  const autoToday = useRef(true); // false once the manager explicitly picks a different date
  const { perRep, grand } = officeRollup(scope === "day" ? date : null);

  // Keep the "single day" view pinned to the real current day even if this
  // page is left open across midnight — otherwise it silently keeps showing
  // yesterday until someone thinks to reload.
  useEffect(() => {
    const check = () => { if (autoToday.current) setDate((d) => (d === today() ? d : today())); };
    const id = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);

  const onDateChange = (e) => { autoToday.current = false; setDate(e.target.value); };

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      if (!DEMO) await initLive(); // re-pull a fresh snapshot + resubscribe realtime
      else await new Promise((r) => setTimeout(r, 300));
      autoToday.current = true;
      setDate(today());
    } finally {
      setRefreshing(false);
    }
  };

  const exportCSV = () => downloadCSV(`office-${scope === "day" ? date : "all"}.csv`, perRep.map(({ rep, ...t }) => ({
    Rep: rep.name, Doors: t.doors, NH: t.nh, RL: t.rl, DM: t.dm, "B/ID": t.bid, D: t.d, NI: t.ni, CB: t.cb,
  })));

  return (
    <PullToRefresh onRefresh={doRefresh}>
      <div className="page-head">
        <div>
          <h1>Office Sheet</h1>
          <p>Every rep's street sheet, rolled up live — click a rep for the itemized breakdown.</p>
        </div>
        <div className="row">
          <select className="select" style={{ width: "auto" }} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="day">Single day</option>
            <option value="all">All time</option>
          </select>
          {scope === "day" && <input className="input" type="date" value={date} onChange={onDateChange} style={{ width: "auto" }} />}
          <button className="btn" onClick={doRefresh} disabled={refreshing} title="Pull down anywhere on this page to refresh too">
            {refreshing ? "↻ Refreshing…" : "↻ Refresh"}
          </button>
          <button className="btn" onClick={exportCSV}>⤓ Export CSV</button>
        </div>
      </div>

      <div className="cards grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="n">{grand.doors}</div><div className="l">Doors knocked</div></div>
        <div className="card stat"><div className="n">{grand.dm}</div><div className="l">Decision makers</div></div>
        <div className="card stat"><div className="n" style={{ color: "var(--green)" }}>{grand.d}</div><div className="l">Deals</div></div>
        <div className="card stat"><div className="n">{grand.ni}</div><div className="l">Not interested</div></div>
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{perRep.length} rep{perRep.length === 1 ? "" : "s"} · tap a name to see their doors</p>
        <table className="tbl">
          <thead>
            <tr>
              <th>Rep</th>
              <th style={{ textAlign: "center" }}>Doors</th>
              {SHEET_COLS.map((c) => <th key={c.key} title={c.title} style={{ textAlign: "center" }}>{c.lab}</th>)}
              <th style={{ textAlign: "center" }}>CB</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {perRep.map(({ rep, ...t }) => (
              <tr key={rep.id} className="rep-row" onClick={() => setOpenRep(rep)}>
                <td><span className="rep-link">{rep.name}</span></td>
                <td style={{ textAlign: "center" }}>{t.doors}</td>
                {SHEET_COLS.map((c) => <td key={c.key} style={{ textAlign: "center", color: c.key === "d" && t.d ? "var(--green)" : undefined, fontWeight: c.key === "d" && t.d ? 600 : 400 }}>{t[c.key]}</td>)}
                <td style={{ textAlign: "center" }}>{t.cb}</td>
                <td className="muted" style={{ textAlign: "right", fontSize: 12 }}>Details →</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td>Office total</td>
              <td style={{ textAlign: "center" }}>{grand.doors}</td>
              {SHEET_COLS.map((c) => <td key={c.key} style={{ textAlign: "center" }}>{grand[c.key]}</td>)}
              <td style={{ textAlign: "center" }}>{grand.cb}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {openRep && (
        <RepDetail
          rep={openRep}
          rows={state.streetRows.filter((r) => r.repId === openRep.id && (scope === "day" ? r.date === date : true))}
          scope={scope}
          date={date}
          onClose={() => setOpenRep(null)}
        />
      )}
    </PullToRefresh>
  );
}

function RepDetail({ rep, rows, scope, date, onClose }) {
  const sorted = [...rows].sort((a, b) => (a.date === b.date ? (a.slot || 0) - (b.slot || 0) : b.date.localeCompare(a.date)));
  // group by date when viewing all-time, since one rep can have many days of history
  const byDate = {};
  sorted.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <Modal title={`${rep.name} · ${scope === "day" ? fmtDate(date) : "All doors"}`} onClose={onClose} width={640}>
      {rows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No doors logged{scope === "day" ? " on this date." : " yet."}</p>
      ) : (
        dates.map((d) => (
          <div key={d} style={{ marginBottom: 16 }}>
            {scope === "all" && <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 8px" }}>{fmtDate(d)}</div>}
            <table className="tbl">
              <thead>
                <tr><th style={{ width: 34 }}>#</th><th>Street</th><th>Disposition</th><th>Contact</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {byDate[d].map((r) => (
                  <tr key={r.id}>
                    <td className="muted">{r.slot ?? "—"}</td>
                    <td>{r.street || <span className="muted">—</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                        {SHEET_COLS.filter((c) => r[c.key]).map((c) => (
                          <span key={c.key} className="tag" title={c.title} style={c.key === "d" ? { borderColor: "var(--green)", color: "var(--green)" } : undefined}>{c.lab}</span>
                        ))}
                        {!SHEET_COLS.some((c) => r[c.key]) && <span className="muted">—</span>}
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {r.customer || ""}{r.customer && r.phone ? " · " : ""}{r.phone || ""}
                      {r.cb && <div>CB {r.cb}</div>}
                    </td>
                    <td className="muted" style={{ fontSize: 13, maxWidth: 180 }}>{r.comments || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </Modal>
  );
}
