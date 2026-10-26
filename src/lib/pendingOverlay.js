// Reconcile server snapshots with the authenticated agent's durable offline
// queue. Supabase may return yesterday's version of an entry during a reconnect;
// never erase the rep's newer pending edit from the visible Street Sheet.
export function overlayPending(snapshot, writes = []) {
  if (!Array.isArray(writes) || !writes.length) return snapshot;
  const result = { ...snapshot };
  const tableToList = {
    homes: "homes", deals: "deals", profiles: "users", posts: "posts",
    territories: "territories", street_rows: "streetRows",
    report_batches: "reportBatches", report_rows: "reportRows",
  };
  for (const write of writes) {
    if (!write?.table || !write.id) continue;
    if (write.table === "daily_submissions") {
      const days = result.submittedDays || (result.submittedDays = { ...(snapshot.submittedDays || {}) });
      if (write.op === "delete") delete days[write.id];
      else if (write.op === "upsert") {
        const p = write.payload;
        days[write.id] = { submittedAt: p.submittedAt, notes: p.notes || "" };
      }
      continue;
    }
    if (write.table === "organizations" && write.op === "upsert") {
      result.org = { ...(result.org || {}), ...write.payload };
      continue;
    }
    const key = tableToList[write.table];
    if (!key || !Object.hasOwn(snapshot, key)) continue;
    if (result[key] === snapshot[key]) result[key] = [...snapshot[key]];
    const entries = result[key];
    const at = entries.findIndex((r) => r.id === write.id);
    if (write.op === "delete") {
      if (at !== -1) entries.splice(at, 1);
    } else if (write.op === "upsert" && write.payload) {
      const entity = write.payload;
      if (at === -1) entries.push(entity);
      else entries[at] = { ...entries[at], ...entity };
    }
  }
  return result;
}
