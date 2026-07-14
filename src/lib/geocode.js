// Shared US ZIP-code lookup via OpenStreetMap's Nominatim (free, no key).
// Returns the ZIP's center point and, when Nominatim has one, its boundary
// polygon (used for territory drawing; a bounding-box rectangle otherwise).
export async function geocodeZip(zip, { timeoutMs = 8000 } = {}) {
  if (!zip || !zip.trim()) return null;
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&countrycodes=us&postalcode=${encodeURIComponent(zip.trim())}`,
      { headers: { Accept: "application/json" }, signal: ctl.signal }
    );
    const hit = (await r.json())[0];
    if (!hit) return null;
    const lat = +(+hit.lat).toFixed(6), lng = +(+hit.lon).toFixed(6);
    const g = hit.geojson;
    let ring = g?.type === "Polygon" ? g.coordinates[0] : g?.type === "MultiPolygon" ? g.coordinates[0][0] : null;
    let boundary = null;
    if (ring) {
      boundary = ring.map(([lo, la]) => [+la.toFixed(6), +lo.toFixed(6)]);
      if (boundary.length > 120) { const step = Math.ceil(boundary.length / 120); boundary = boundary.filter((_, i) => i % step === 0); }
    } else if (hit.boundingbox) {
      const bb = hit.boundingbox.map(Number); // [south, north, west, east]
      boundary = [[bb[0], bb[2]], [bb[1], bb[2]], [bb[1], bb[3]], [bb[0], bb[3]]];
    }
    return { lat, lng, boundary };
  } finally {
    clearTimeout(to);
  }
}
