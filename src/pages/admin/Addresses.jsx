import { useState, useMemo } from "react";
import { useStore, getState, importParcels } from "../../store";
import { parseCSV } from "../../lib/csv.js";
import { detectColumns, mapParcelRows } from "../../lib/parcels.js";

// Bulk address/parcel import. Until this existed the map only knew about
// doors a rep had already tapped, which meant a rep learned the homeowner's
// name only after knocking. Loading a parcel extract puts the street on the
// map -- address and owner both -- before anyone walks it.
const FIELDS = [
  ["addr", "Address", true],
  ["ownerName", "Homeowner", false],
  ["lat", "Latitude", true],
  ["lng", "Longitude", true],
  ["serviced", "Already a customer", false],
];

export default function Addresses() {
  useStore();
  const state = getState();
  const reps = state.users.filter((u) => u.role === "rep" || u.role === "manager");
  const [file, setFile] = useState(null);       // { name, headers, rows }
  const [cols, setCols] = useState({});
  const [assignTo, setAssignTo] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const withOwner = state.homes.filter((h) => h.ownerName).length;
  const served = state.homes.filter((h) => h.serviced).length;

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    // Clear the input immediately so choosing the same file AGAIN still fires
    // a change event. Without this, re-importing a refreshed extract that
    // keeps its filename (parcels.csv week after week -- the exact workflow
    // this page advertises) silently does nothing: the browser sees an
    // unchanged file list and never dispatches change. The File object read
    // below stays valid after the value reset.
    e.target.value = "";
    if (!f) return;
    setErr(""); setResult(null);
    try {
      const { headers, rows } = parseCSV(await f.text());
      if (!headers.length || !rows.length) { setErr("That file didn't have any rows we could read."); return; }
      setFile({ name: f.name, headers, rows });
      setCols(detectColumns(headers));
    } catch {
      setErr("Couldn't read that file — make sure it's a .csv export.");
    }
  };

  const mapped = useMemo(
    () => (file ? mapParcelRows(file.rows, file.headers, cols) : null),
    [file, cols]
  );

  const run = () => {
    if (!mapped?.parcels.length) return;
    setResult(importParcels(mapped.parcels, { repId: assignTo || null }));
    setFile(null);
    setCols({});
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Addresses</h1>
          <p>Load a parcel or address list so reps see the street — and who lives there — before they knock.</p>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 22, flexWrap: "wrap" }}>
          <div className="stat"><div className="n">{state.homes.length}</div><div className="l">Addresses on file</div></div>
          <div className="stat"><div className="n">{withOwner}</div><div className="l">With a homeowner name</div></div>
          <div className="stat"><div className="n">{served}</div><div className="l">Existing customers</div></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Import a list</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          A CSV with one row per address. Columns are matched by name — address, owner, latitude and
          longitude in any order — and anything we guess wrong you can correct below. Rows without
          coordinates are reported rather than dropped, and an address already on file is updated
          instead of duplicated, so re-importing a refreshed extract is safe.
        </p>

        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        {err && <p style={{ color: "var(--danger, #dc2626)", fontSize: 13 }}>{err}</p>}

        {file && (
          <>
            <p className="muted" style={{ fontSize: 13 }}>
              <strong>{file.name}</strong> — {file.rows.length} rows
            </p>

            <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              {FIELDS.map(([key, label, required]) => (
                <label className="field" key={key} style={{ minWidth: 190, marginBottom: 0 }}>
                  <span>{label}{required ? " *" : ""}</span>
                  <select className="select" value={cols[key] || ""}
                    onChange={(e) => setCols((c) => ({ ...c, [key]: e.target.value || undefined }))}>
                    <option value="">— none —</option>
                    {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
              <label className="field" style={{ minWidth: 190, marginBottom: 0 }}>
                <span>Assign doors to</span>
                <select className="select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">— unassigned —</option>
                  {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            </div>

            {mapped && (
              <>
                <p style={{ fontSize: 14 }}>
                  Ready to import <strong>{mapped.parcels.length}</strong>
                  {mapped.skipped.length > 0 && (
                    <span className="muted"> · {mapped.skipped.length} will be skipped</span>
                  )}
                </p>

                {mapped.parcels.length > 0 && (
                  <div className="table-scroll" style={{ maxHeight: 260 }}>
                    <table className="tbl">
                      <thead><tr><th>Address</th><th>Homeowner</th><th>Lat</th><th>Lng</th><th>Customer</th></tr></thead>
                      <tbody>
                        {mapped.parcels.slice(0, 25).map((p, i) => (
                          <tr key={i}>
                            <td>{p.addr}</td>
                            <td className="muted">{p.ownerName || "—"}</td>
                            <td className="muted">{p.lat}</td>
                            <td className="muted">{p.lng}</td>
                            <td className="muted">{p.serviced ? "yes" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {mapped.skipped.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="muted" style={{ fontSize: 13, cursor: "pointer" }}>
                      {mapped.skipped.length} rows can't be imported — see why
                    </summary>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6, display: "grid", gap: 2 }}>
                      {mapped.skipped.slice(0, 20).map((s, i) => (
                        <div key={i}>• {s.addr || "(no address)"} — {s.reason}</div>
                      ))}
                      {mapped.skipped.length > 20 && <div>…and {mapped.skipped.length - 20} more</div>}
                    </div>
                  </details>
                )}

                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn primary" onClick={run} disabled={!mapped.parcels.length}>
                    Import {mapped.parcels.length} addresses
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {result && (
          <p style={{ fontSize: 14, marginTop: 12 }}>
            ✅ Imported — <strong>{result.added}</strong> new
            {result.updated > 0 && <> and <strong>{result.updated}</strong> updated</>}.
          </p>
        )}
      </div>
    </>
  );
}
