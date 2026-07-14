// ============================================================
// Tiny stale-while-revalidate cache (client read layer).
// Factory takes a clock for deterministic tests.
// ============================================================
export function createCache({ now = () => Date.now() } = {}) {
  const store = new Map(); // key -> { value, exp }

  function get(key) {
    const hit = store.get(key);
    if (!hit) return { hit: false };
    return { hit: true, value: hit.value, fresh: now() < hit.exp };
  }
  function set(key, value, ttlMs) {
    store.set(key, { value, exp: now() + ttlMs });
  }
  function invalidate(key) { store.delete(key); }
  function clear() { store.clear(); }

  // Return cached value immediately if fresh; otherwise fetch.
  // On a stale hit, return the stale value and revalidate in the background.
  async function swr(key, fetcher, ttlMs, onUpdate) {
    const c = get(key);
    if (c.hit && c.fresh) return c.value;
    if (c.hit) { // stale-while-revalidate
      fetcher().then((v) => { set(key, v, ttlMs); onUpdate?.(v); }).catch(() => {});
      return c.value;
    }
    const v = await fetcher();
    set(key, v, ttlMs);
    return v;
  }

  return { get, set, invalidate, clear, swr };
}

export const cache = createCache();
