// ============================================================
// Pure mappers: local camelCase state  ⇄  snake_case DB rows.
// No side effects — unit-tested in test/api.test.mjs.
// ============================================================

export const homeToRow = (h, orgId) => ({
  id: h.id, org_id: orgId, rep_id: h.repId,
  addr: h.addr, lat: h.lat, lng: h.lng, status: h.status,
  contact: h.contact || null, phone: h.phone || null, notes: h.notes || null,
  due: h.due || null, activity: h.activity || [],
});
export const homeFromRow = (r) => ({
  id: r.id, repId: r.rep_id, addr: r.addr, lat: r.lat, lng: r.lng,
  status: r.status, contact: r.contact || "", phone: r.phone || "",
  notes: r.notes || "", due: r.due || "", activity: r.activity || [],
});

export const dealToRow = (d, orgId) => ({
  id: d.id, org_id: orgId, rep_id: d.repId, home_id: d.homeId,
  customer: d.customer, product: d.product, value_cents: Math.round((d.value || 0) * 100),
  created_at: new Date(d.ts || Date.now()).toISOString(),
});
export const dealFromRow = (r) => ({
  id: r.id, repId: r.rep_id, homeId: r.home_id, customer: r.customer,
  product: r.product, value: Math.round((r.value_cents || 0) / 100), addr: r.addr || "",
  ts: r.created_at ? Date.parse(r.created_at) : Date.now(),
});

export const postToRow = (p, orgId) => ({
  id: p.id, org_id: orgId, author_id: p.authorId, title: p.title,
  body: p.body || null, pinned: !!p.pinned,
});
export const postFromRow = (r) => ({
  id: r.id, authorId: r.author_id, authorName: r.author_name || "", title: r.title,
  body: r.body || "", pinned: !!r.pinned, ts: r.created_at ? Date.parse(r.created_at) : Date.now(),
});

export const territoryToRow = (t, orgId) => ({
  id: t.id, org_id: orgId, name: t.name, color: t.color,
  assigned_to: t.assignedTo || null,
  boundary: t.boundary && t.boundary.length >= 3 ? toPolygon(t.boundary) : null,
  start_on: t.start || null, end_on: t.end || null, notes: t.notes || null,
});
export const territoryFromRow = (r) => ({
  id: r.id, name: r.name, color: r.color, assignedTo: r.assigned_to || "",
  boundary: fromPolygon(r.boundary), start: r.start_on || "", end: r.end_on || "", notes: r.notes || "",
});

export const profileToRow = (u, orgId) => ({
  id: u.id, org_id: orgId, full_name: u.name, email: u.email,
  role: u.role, status: u.status, territory: u.territory, seat_price_cents: u.plan || 0,
  timezone: u.timezone || null, home_zip: u.homeZip || null, home_lat: u.homeLat ?? null, home_lng: u.homeLng ?? null,
});
export const profileFromRow = (r) => ({
  id: r.id, name: r.full_name, email: r.email, role: r.role, status: r.status,
  territory: r.territory || "—", plan: r.seat_price_cents || 0,
  timezone: r.timezone || null, homeZip: r.home_zip || null, homeLat: r.home_lat ?? null, homeLng: r.home_lng ?? null,
});

export const streetRowToRow = (r, orgId) => ({
  id: r.id, org_id: orgId, rep_id: r.repId, day: r.date, street: r.street || null,
  nh: !!r.nh, rl: !!r.rl, dm: !!r.dm, bid: !!r.bid, d: !!r.d, ni: !!r.ni, nq: !!r.nq,
  customer: r.customer || null, phone: r.phone || null, comments: r.comments || null, cb: r.cb || null,
  done: !!r.done, snooze_until: r.snoozeUntil || 0,
});
export const streetRowFromRow = (r) => ({
  id: r.id, repId: r.rep_id, date: r.day, street: r.street || "",
  nh: !!r.nh, rl: !!r.rl, dm: !!r.dm, bid: !!r.bid, d: !!r.d, ni: !!r.ni, nq: !!r.nq,
  customer: r.customer || "", phone: r.phone || "", comments: r.comments || "", cb: r.cb || "",
  done: !!r.done, snoozeUntil: r.snooze_until || 0, createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
});

// GeoJSON Polygon <-> [[lat,lng],...] ring (lng/lat order in GeoJSON, closed ring).
export function toPolygon(ring) {
  const closed = ring[0] && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
    ? [...ring, ring[0]] : ring;
  return { type: "Polygon", coordinates: [closed.map(([lat, lng]) => [lng, lat])] };
}
export function fromPolygon(geo) {
  if (!geo || geo.type !== "Polygon") return [];
  return (geo.coordinates?.[0] || []).map(([lng, lat]) => [lat, lng]);
}
