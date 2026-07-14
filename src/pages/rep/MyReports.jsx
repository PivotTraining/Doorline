import { useStore, repReportRows } from "../../store";
import { downloadCSV } from "../../lib/csv.js";

export default function MyReports({ user }) {
  useStore();
  const groups = repReportRows(user.id);

  const dl = (batch, rows) => downloadCSV(
    `${batch.name.replace(/\s+/g, "-")}-mine.csv`,
    rows.map((r) => r.data)
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Reports</h1>
          <p>Reports your manager has shared with you — just your rows, tied to your rep ID.</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Nothing shared yet. When your manager publishes a report, your numbers show up here.</p></div>
      ) : (
        groups.map(({ batch, rows }) => {
          const cols = batch.cols && batch.cols.length ? batch.cols : Object.keys(rows[0]?.data || {});
          return (
            <div className="card" key={batch.id} style={{ marginBottom: 14 }}>
              <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{batch.name}</h3>
                  <span className="muted" style={{ fontSize: 13 }}>{rows.length} row{rows.length === 1 ? "" : "s"} · shared {new Date(batch.ts).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                </div>
                <button className="btn" onClick={() => dl(batch, rows)}>⤓ Download my rows</button>
              </div>
              <div className="table-scroll" style={{ marginTop: 10 }}>
                <table className="tbl">
                  <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>{cols.map((c) => <td key={c}>{r.data[c] ?? ""}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
