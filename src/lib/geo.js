// Geometry helpers (pure). Rings are [[lat,lng], ...].

// Ray-casting point-in-polygon. point = [lat, lng].
export function pointInPolygon(point, ring) {
  if (!ring || ring.length < 3) return false;
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Territory zones (with a boundary) assigned to a rep.
export function repZones(state, repId) {
  return (state.territories || []).filter((t) => t.assignedTo === repId && t.boundary && t.boundary.length >= 3);
}

// Is the point inside any of the rep's zones? True if the rep has no zone (nothing to violate).
export function inRepZone(state, repId, lat, lng) {
  const zones = repZones(state, repId);
  if (zones.length === 0) return true;
  return zones.some((z) => pointInPolygon([lat, lng], z.boundary));
}
