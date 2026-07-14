// ============================================================
// Master-report segmentation (pure, unit-tested).
// Takes the parsed rows of an uploaded master report + the column that
// holds each row's rep identifier, and splits the rows per rep. A value
// matches a rep by their Doorline rep ID code, their email, or their name
// (case/space-insensitive). Anything that doesn't match is surfaced as
// "unmatched" so the admin can map it by hand -- nothing is silently lost.
// ============================================================
import { repCode } from "./campaigns.js";

const norm = (v) => String(v ?? "").trim().toLowerCase();

// Build a lookup from every identifier a rep could appear under -> repId.
export function buildRepIndex(reps) {
  const idx = new Map();
  for (const r of reps || []) {
    const put = (k) => { const n = norm(k); if (n) idx.set(n, r.id); };
    put(repCode(r.id));
    put(r.email);
    put(r.name);
    if (r.homeZip) { /* not an identity key -- skip */ }
  }
  return idx;
}

// rows: array of objects; idColumn: header name; reps: [{id,name,email}]
// overrides: { [rawValue]: repId } manual mappings from the admin.
// -> { byRep: Map<repId, rows>, unmatched: Map<rawValue, rows>, counts }
export function segmentReport(rows, idColumn, reps, overrides = {}) {
  const idx = buildRepIndex(reps);
  const byRep = new Map();
  const unmatched = new Map();
  for (const row of rows || []) {
    const raw = row[idColumn];
    const key = norm(raw);
    const repId = overrides[raw] ?? overrides[key] ?? idx.get(key);
    if (repId) {
      if (!byRep.has(repId)) byRep.set(repId, []);
      byRep.get(repId).push(row);
    } else {
      const bucket = raw == null || String(raw).trim() === "" ? "(blank)" : String(raw);
      if (!unmatched.has(bucket)) unmatched.set(bucket, []);
      unmatched.get(bucket).push(row);
    }
  }
  return {
    byRep,
    unmatched,
    counts: {
      total: (rows || []).length,
      matchedReps: byRep.size,
      matchedRows: [...byRep.values()].reduce((a, r) => a + r.length, 0),
      unmatchedValues: unmatched.size,
      unmatchedRows: [...unmatched.values()].reduce((a, r) => a + r.length, 0),
    },
  };
}
