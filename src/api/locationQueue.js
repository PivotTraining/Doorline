// ============================================================
// Offline-safe GPS batcher (client side of the firehose).
// Buffers points, flushes batches to `send`, and RETAINS the
// buffer on failure so nothing is lost offline. Factory takes
// `send` + clock so the core is unit-tested without a network.
// ============================================================
export function createLocationQueue({ send, maxBatch = 200, now = () => Date.now() }) {
  let buf = [];
  let failures = 0;
  let lastFlush = 0;

  function enqueue(pt) {
    buf.push({ lat: +(+pt.lat).toFixed(6), lng: +(+pt.lng).toFixed(6), ts: pt.ts || new Date(now()).toISOString() });
  }

  // Send the head of the buffer; only drop what was actually accepted.
  async function flush() {
    if (buf.length === 0) return { accepted: 0 };
    const batch = buf.slice(0, maxBatch);
    try {
      const res = await send(batch);
      buf = buf.slice(batch.length);
      failures = 0;
      lastFlush = now();
      return { accepted: batch.length, ...(res || {}) };
    } catch {
      failures += 1; // keep the buffer for the next attempt (offline-safe)
      return { accepted: 0, error: true, failures };
    }
  }

  // Backoff grows with consecutive failures (cap ~5 min).
  function nextDelay(baseMs) {
    return Math.min(baseMs * Math.pow(2, failures), 5 * 60 * 1000);
  }

  return {
    enqueue,
    flush,
    nextDelay,
    size: () => buf.length,
    failures: () => failures,
    lastFlush: () => lastFlush,
  };
}
