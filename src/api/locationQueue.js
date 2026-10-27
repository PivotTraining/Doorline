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
  let flushing = false;

  function enqueue(pt) {
    // Never insert invalid coordinates. JSON serializes NaN as null, which
    // causes the ingestion service to reject the entire GPS batch.
    const lat = Number(pt?.lat);
    const lng = Number(pt?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)
        || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    buf.push({ lat: +lat.toFixed(6), lng: +lng.toFixed(6),
      ts: pt.ts || new Date(now()).toISOString() });
    return true;
  }

  // Serial flushing prevents the 15-second timer from sending the same GPS
  // samples twice while an earlier network request is still in flight.
  async function flush() {
    if (flushing || buf.length === 0) return { accepted: 0, pending: buf.length };
    flushing = true;
    const batch = buf.slice(0, maxBatch);
    try {
      const res = await send(batch);
      const accepted = res?.accepted === undefined
        ? batch.length : Number(res.accepted);
      if (!Number.isInteger(accepted) || accepted < 0 || accepted > batch.length) {
        throw new Error("invalid_ingest_receipt");
      }
      // Never drop unsent tail samples, even on a partially accepted batch.
      buf = buf.slice(accepted);
      failures = accepted ? 0 : failures + 1;
      lastFlush = now();
      return { ...(res || {}), accepted, pending: buf.length };
    } catch {
      failures += 1;
      return { accepted: 0, error: true, failures, pending: buf.length };
    } finally {
      flushing = false;
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
