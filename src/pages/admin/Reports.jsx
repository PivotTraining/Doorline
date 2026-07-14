import { useState, useMemo } from "react";
import { useStore, getState, publishReportBatch, deleteReportBatch } from "../../store";
import { repCode } from "../../lib/campaigns.js";
import { parseCSV, downloadCSV } from "../../lib/csv.js";
import { segmentReport } from "../../lib/reports.js";

export default function Reports() {
  useStore();
  const state = getState();
  const reps = state.users.filter((u) => u.role === "rep" || u.role === "manager");
  const [file, setFile] = useState(null);   // { name, headers, rows }
  const [idCol, setIdCol] = useState("");
  const [overrides, setOverrides] = useState({}); // rawValue -> repId
  const [err, setErr] = useState("");
  const [published, setPublished] = useState("");

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(""); setOverrides({}); setIdCol("");
    try {
      const text = await f.text();
      const { headers, rows } = parseCSV(text);
      if (!headers.length || !rows.length) { setErr("That file didn't have any rows we could read."); return; }
      setFile({ name: f.name, headers, rows });
      // best-guess the ID column by header name
      const guess = headers.find((h) => /\b(id|agent|rep|code)\b/i.test(h));
      setIdCol(guess || headers[0]);
    } catch {
      setErr("Couldn't read that file — make sure it's a .csv export.");
    }
  };

  const seg = useMemo(
    () => (file && idCol ? segmentReport(file.rows, idCol, reps, overrides) : null),
    [file, idCol, overrides, reps]
  );

  const nameOf = (id) => reps.find((r) => r.id === id)?.name || "Unknown";
  const dlRep = (id, rows) => downloadCSV(`${nameOf(id).replace(/\s+/g, "-")}-${repCode(id)}-report.csv`, rows);
  const setOverride = (raw, repId) => setOverrides((o) => ({ ...o, [raw]: repId || undefined }));

  // Publish the assigned rows so each rep sees their own slice in-app.
  const publish = () => {
    if (!seg) return;
    const assigned = [];
    for (const [repId, rows] of seg.byRep.entries()) for (const data of rows) assigned.push({ repId, data });
    if (!assigned.length) { setErr("Nothing is assigned to a rep yet."); return; }
    const { count } = publishReportBatch({ name: file.name.replace(/\.csv$/i, ""), cols: file.headers }, assigned);
    setPublished(`Published ${count} rows to ${seg.byRep.size} ${seg.byRep.size === 1 ? "rep" : "reps"}. They can see them under My Reports.`);
    setTimeout(() => setPublished(""), 6000);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Upload a master report (CSV) and Doorline splits it by rep automatically — so each person's numbers are broken out and downloadable, tied to their rep ID.</p>
        </div>
        {file && <label className="btn">↻ New file<input type="file" accept=".csv,text/csv" hidden onChange={onFile} /></label>}
      </div>

      {err && <div className="err">{err}</div>}

      {!file ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
          <h3 style={{ margin: "0 0 6px" }}>Upload a master report</h3>
          <p className="muted" style={{ marginTop: 0 }}>A CSV with one column holding each row's rep ID (or agent code, email, or name). We match it to your people and split the rest.</p>
          <label className="btn primary">Choose CSV file<input type="file" accept=".csv,text/csv" hidden onChange={onFile} /></label>
          <p className="muted" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>Tip: each rep's ID code is on the Personnel page. If your reps enroll with their Campaign link, the campaign's report will already carry that code.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
              <div>
                <b>{file.name}</b> · <span className="muted">{file.rows.length} rows</span>
              </div>
              <label className="row" style={{ gap: 8, margin: 0, alignItems: "center" }}>
                <span className="muted" style={{ fontSize: 13 }}>Rep ID is in column:</span>
                <select className="select" style={{ width: "auto" }} value={idCol} onChange={(e) => { setIdCol(e.target.value); setOverrides({}); }}>
                  {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            </div>
            {seg && (
              <p className="muted" style={{ fontSize: 13, marginBottom: 0, marginTop: 10 }}>
                {seg.counts.matchedRows} rows matched to {seg.counts.matchedReps} {seg.counts.matchedReps === 1 ? "person" : "people"}
                {seg.counts.unmatchedRows > 0 && <> · <span style={{ color: "var(--amber)" }}>{seg.counts.unmatchedRows} rows in {seg.counts.unmatchedValues} unrecognized ID{seg.counts.unmatchedValues === 1 ? "" : "s"} need mapping below</span></>}
              </p>
            )}
          </div>

          {seg && seg.counts.matchedRows > 0 && (
            <div className="card" style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <b>Publish to reps</b>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>Send each rep their {seg.counts.matchedRows} matched rows so they can see + download their own slice under My Reports.</p>
                {published && <p style={{ color: "var(--green)", fontSize: 13, margin: "6px 0 0" }}>{published}</p>}
              </div>
              <button className="btn primary" onClick={publish}>📤 Publish to reps</button>
            </div>
          )}

          {seg && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 style={{ marginTop: 0 }}>Per-rep breakdown</h3>
              <div className="table-scroll">
                <table className="tbl">
                  <thead><tr><th>Rep</th><th>Rep ID</th><th style={{ textAlign: "center" }}>Rows</th><th></th></tr></thead>
                  <tbody>
                    {reps.map((r) => {
                      const rows = seg.byRep.get(r.id) || [];
                      return (
                        <tr key={r.id} style={{ opacity: rows.length ? 1 : 0.5 }}>
                          <td>{r.name}</td>
                          <td className="muted" style={{ fontFamily: "monospace" }}>{repCode(r.id)}</td>
                          <td style={{ textAlign: "center" }}>{rows.length}</td>
                          <td style={{ textAlign: "right" }}>{rows.length > 0 && <button className="btn sm" onClick={() => dlRep(r.id, rows)}>⤓ Download</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {seg && seg.unmatched.size > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Unrecognized IDs</h3>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>These ID values in the file didn't match anyone. Map each to a rep and their rows fold into the breakdown above.</p>
              <div className="table-scroll">
                <table className="tbl">
                  <thead><tr><th>ID in file</th><th style={{ textAlign: "center" }}>Rows</th><th>Assign to</th></tr></thead>
                  <tbody>
                    {[...seg.unmatched.entries()].map(([raw, rows]) => (
                      <tr key={raw}>
                        <td style={{ fontFamily: "monospace" }}>{raw}</td>
                        <td style={{ textAlign: "center" }}>{rows.length}</td>
                        <td>
                          <select className="select" style={{ width: "auto" }} value={overrides[raw] || ""} onChange={(e) => setOverride(raw, e.target.value)}>
                            <option value="">— leave unassigned —</option>
                            {reps.map((r) => <option key={r.id} value={r.id}>{r.name} ({repCode(r.id)})</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {state.reportBatches.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Published reports</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Reports your team can already see in their own My Reports.</p>
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Report</th><th style={{ textAlign: "center" }}>Rows</th><th>Published</th><th></th></tr></thead>
              <tbody>
                {state.reportBatches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td style={{ textAlign: "center" }}>{state.reportRows.filter((r) => r.batchId === b.id).length}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{new Date(b.ts).toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                    <td style={{ textAlign: "right" }}><button className="btn sm danger" onClick={() => { if (confirm(`Unpublish "${b.name}"? Reps will no longer see it.`)) deleteReportBatch(b.id); }}>Unpublish</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
