// Route planning math (pure, no DOM/network — unit-tested in test/api.test.mjs).
//
// Territories answer "where does this rep work today". A route answers "in
// what order do they walk it", which is the part that actually saves time on
// the ground: a street canvassed in map order instead of a sensible walking
// order costs a rep real hours over a day.
//
// Ordering is nearest-neighbour seeded from the rep's start point, then
// improved with 2-opt. NN alone is fast but reliably produces one or two
// ugly cross-overs where it strands a door and has to come back for it;
// 2-opt removes exactly those. Both are deterministic — the same input
// always yields the same order, so a route doesn't reshuffle under a rep
// between reloads.

const R_M = 6371008.8; // IUGG mean Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

// Great-circle distance in metres between two {lat,lng} points.
export function haversineM(a, b) {
  if (!a || !b) return 0;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

const usable = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

// Total walking distance of an ordered stop list, measured from `start`.
export function routeLengthM(stops, start) {
  let total = 0;
  let prev = usable(start) ? start : stops[0];
  for (const s of stops) {
    total += haversineM(prev, s);
    prev = s;
  }
  return total;
}

// Reorder stops into a walking sequence beginning at `start` (the rep's
// current position, or the first stop when there is none). Input is never
// mutated; points missing coordinates are dropped rather than sorted to a
// nonsense position.
export function orderStops(stops, start) {
  const pts = (stops || []).filter(usable);
  if (pts.length < 2) return pts;

  const origin = usable(start) ? start : pts[0];

  // --- nearest neighbour ---
  const remaining = pts.slice();
  const out = [];
  let cur = origin;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(cur, remaining[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    cur = remaining[best];
    out.push(cur);
    remaining.splice(best, 1);
  }

  // --- 2-opt: reverse any segment that shortens the walk ---
  // Bounded so a large route can't spin: routes are tens of doors, not
  // thousands, and an exact optimum isn't worth a frozen phone.
  const MAX_PASSES = 12;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < out.length - 1; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = i === 0 ? origin : out[i - 1];
        const b = out[i];
        const c = out[j];
        const d = out[j + 1];
        // Cost of the two edges this reversal would swap. The tail edge
        // only exists when j isn't the last stop (open path, not a loop).
        const before = haversineM(a, b) + (d ? haversineM(c, d) : 0);
        const after = haversineM(a, c) + (d ? haversineM(b, d) : 0);
        if (after < before - 1e-9) {
          let lo = i, hi = j;
          while (lo < hi) { const t = out[lo]; out[lo] = out[hi]; out[hi] = t; lo++; hi--; }
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  return out;
}

// Human-readable distance for the UI ("420 m" / "1.4 km" / "0.9 mi").
export function fmtDistance(metres, { imperial = true } = {}) {
  if (!Number.isFinite(metres) || metres <= 0) return "—";
  if (imperial) {
    const feet = metres * 3.28084;
    if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`;
    return `${(metres / 1609.344).toFixed(1)} mi`;
  }
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
