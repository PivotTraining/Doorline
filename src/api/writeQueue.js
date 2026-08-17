// ============================================================
// Durable write-through queue for live-mode mutations (homes, deals,
// street_rows, etc). The old fire-and-forget sync.up()/del() dropped a
// failed write silently and permanently -- no retry, nothing durable, no
// signal to the user. For a rep working door-to-door with patchy signal,
// that's a real way to lose a shift's work with zero indication anything
// went wrong. This queue persists pending writes to localStorage (so they
// survive a reload or the app being closed) and retries them, in order,
// until they land.
// ===========================================================
const KEY = "doorline_write_queue_v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save(q) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    // Storage full/unavailable -- queue stays in memory for this session.
  }
}

// handlers: { [table]: { upsert(payload), del(id) } }
export function createWriteQueue({ handlers, persist = true }) {
  let q = persist ? load() : [];
  let flushing = false;
  const listeners = new Set();

  const notify = () => listeners.forEach((listener) => listener(q.length));

  function enqueue(table, op, payload) {
    const id = op === "delete" ? payload : payload?.id;
    if (!id) return;

    // A later write for the same row supersedes an earlier queued write.
    q = q.filter((item) => item.id !== id || item.table !== table);

    q.push({
      table,
      op,
      payload,
      id,
      attempts: 0,
      queuedAt: Date.now(),
    });

    if (persist) save(q);
    notify();
  }

  async function flush() {
    if (flushing || q.length === 0) {
      return { flushed: 0, remaining: q.length };
    }

    flushing = true;
    let flushed = 0;

    /*
     * Process a snapshot of the queue.
     *
     * New Street Sheet edits may be added to q while these requests are
     * awaiting Supabase. They must remain in the live queue and must not be
     * overwritten when this batch finishes.
     */
    const batch = [...q];

    const removeExact = (item) => {
      const index = q.indexOf(item);
      if (index !== -1) q.splice(index, 1);
    };

    for (const item of batch) {
      const handler = handlers[item.table];

      if (!handler) {
        // Unknown resources should not retry forever.
        removeExact(item);
        continue;
      }

      try {
        const result =
          item.op === "delete"
            ? await handler.del(item.id)
            : await handler.upsert(item.payload);

        /*
         * Supabase returns database failures as { data, error } rather than
         * always throwing, so an error response is not a successful sync.
         */
        if (result?.error) throw result.error;

        /*
         * Remove only the exact version that was successfully processed.
         *
         * If the user edited the same row while this request was in flight,
         * enqueue() replaced this object with a newer one. The newer edit
         * therefore remains queued and will be sent next.
         */
        removeExact(item);
        flushed++;
      } catch {
        /*
         * Retry this version only when it is still current. If a newer edit
         * replaced it, never restore the stale version over the newer data.
         */
        if (q.includes(item)) {
          item.attempts += 1;
        }
      }
    }

    const hasNewWrites = q.some((item) => !batch.includes(item));

    if (persist) save(q);

    flushing = false;
    notify();

    /*
     * Immediately process edits that arrived during this batch. Ordinary
     * network failures remain queued for the normal retry interval.
     */
    if (hasNewWrites) {
      queueMicrotask(() => flush());
    }

    return {
      flushed,
      remaining: q.length,
    };
  }

  return {
    enqueue,
    flush,
    size: () => q.length,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
