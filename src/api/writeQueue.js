// ============================================================
// Durable write-through queue for live-mode mutations (homes, deals,
// street_rows, etc). The old fire-and-forget sync.up()/del() dropped a
// failed write silently and permanently -- no retry, nothing durable, no
// signal to the user. For a rep working door-to-door with patchy signal,
// that's a real way to lose a shift's work with zero indication anything
// went wrong. This queue persists pending writes to localStorage (so they
// survive a reload or the app being closed) and retries them, in order,
// until they land.
// ============================================================
const KEY = "doorline_write_queue_v1";

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save(q) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage full/unavailable -- queue stays in-memory for this session */ }
}

// handlers: { [table]: { upsert(payload), del(id) } }
export function createWriteQueue({ handlers, persist = true }) {
  let q = persist ? load() : [];
  let flushing = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((l) => l(q.length));

  function enqueue(table, op, payload) {
    const id = op === "delete" ? payload : payload?.id;
    if (!id) return;
    // A later write for the same row supersedes an earlier queued one --
    // no point replaying a stale intermediate state once it's superseded.
    q = q.filter((x) => x.id !== id || x.table !== table);
    q.push({ table, op, payload, id, attempts: 0, queuedAt: Date.now() });
    if (persist) save(q);
    notify();
  }

  async function flush() {
    if (flushing || q.length === 0) return { flushed: 0, remaining: q.length };
    flushing = true;
    let flushed = 0;
    const remaining = [];
    for (const item of q) {
      const h = handlers[item.table];
      if (!h) continue; // unknown table -- drop rather than retry forever
      try {
        if (item.op === "delete") await h.del(item.id);
        else await h.upsert(item.payload);
        flushed++;
      } catch {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }
    q = remaining;
    if (persist) save(q);
    flushing = false;
    notify();
    return { flushed, remaining: q.length };
  }

  return {
    enqueue,
    flush,
    size: () => q.length,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
