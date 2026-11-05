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
  // Contract fields are only sent when a contract was actually captured, so
  // deals without one never reference these columns — deploying the feature
  // can't break deal syncing even before the columns are added to the DB.
  ...(d.signedAt ? {
    signature: d.signature || null,
    signed_name: d.signedName || null,
    signed_at: new Date(d.signedAt).toISOString(),
    contract_terms: d.contractTerms || null,
  } : {}),
});
export const dealFromRow = (r) => ({
  id: r.id, repId: r.rep_id, homeId: r.home_id, customer: r.customer,
  product: r.product, value: Math.round((r.value_cents || 0) / 100), addr: r.addr || "",
  ts: r.created_at ? Date.parse(r.created_at) : Date.now(),
  signature: r.signature || null, signedName: r.signed_name || null,
  signedAt: r.signed_at ? Date.parse(r.signed_at) : null, contractTerms: r.contract_terms || null,
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
  manager_id: u.managerId || null,
  // office_id arrives with migration 0021. Emitted only when set, so this
  // client can still write profiles to a database that predates it --
  // PostgREST rejects the whole row for one unknown column.
  ...(u.officeId ? { office_id: u.officeId } : {}),
});
export const profileFromRow = (r) => ({
  id: r.id, name: r.full_name, email: r.email, role: r.role, status: r.status,
  territory: r.territory || "—", plan: r.seat_price_cents || 0,
  timezone: r.timezone || null, homeZip: r.home_zip || null, homeLat: r.home_lat ?? null, homeLng: r.home_lng ?? null,
  managerId: r.manager_id || null, officeId: r.office_id || null,
});

export const officeToRow = (o, orgId) => ({ id: o.id, org_id: orgId, name: o.name });
export const officeFromRow = (r) => ({ id: r.id, name: r.name });

export const reportBatchToRow = (b, orgId) => ({
  id: b.id, org_id: orgId, name: b.name, cols: b.cols || [], uploaded_by: b.uploadedBy || null,
  created_at: new Date(b.ts || Date.now()).toISOString(),
});
export const reportBatchFromRow = (r) => ({
  id: r.id, name: r.name, cols: r.cols || [], uploadedBy: r.uploaded_by || null,
  ts: r.created_at ? Date.parse(r.created_at) : Date.now(),
});
export const reportRowToRow = (r, orgId) => ({
  id: r.id, org_id: orgId, batch_id: r.batchId, rep_id: r.repId, data: r.data || {},
});
export const reportRowFromRow = (r) => ({ id: r.id, batchId: r.batch_id, repId: r.rep_id, data: r.data || {} });

export const streetRowToRow = (r, orgId) => ({
  id: r.id, org_id: orgId, rep_id: r.repId, day: r.date, street: r.street || null,
  slot: r.slot ?? null,
  nh: !!r.nh, rl: !!r.rl, dm: !!r.dm, bid: !!r.bid, d: !!r.d, ni: !!r.ni, nq: !!r.nq,
  customer: r.customer || null, phone: r.phone || null, comments: r.comments || null, cb: r.cb || null,
  done: !!r.done, snooze_until: r.snoozeUntil || 0,
  // Only sent when the row actually has a linked deal, matching dealToRow's
  // contract-column pattern: a street row without a deal never references
  // this column, so syncing keeps working even before 0017 is applied.
  // (Sending it unconditionally made PostgREST reject EVERY street-row write
  // with PGRST204 on a database that hadn't run the migration yet -- which
  // silently blocked a rep's entire day of entries from ever saving.)
  ...(r.dealId ? { deal_id: r.dealId } : {}),
});
export const streetRowFromRow = (r) => ({
  id: r.id, repId: r.rep_id, date: r.day, street: r.street || "",
  slot: r.slot ?? null,
  nh: !!r.nh, rl: !!r.rl, dm: !!r.dm, bid: !!r.bid, d: !!r.d, ni: !!r.ni, nq: !!r.nq,
  customer: r.customer || "", phone: r.phone || "", comments: r.comments || "", cb: r.cb || "",
  done: !!r.done, snoozeUntil: r.snooze_until || 0, createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  dealId: r.deal_id || null,
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

// ---------- campaigns (0021) ----------
// commission_amount is numeric, not cents: the value means dollars when the
// type is flat and a percentage when it is percent, so a rate like 7.5 has
// to survive intact.
export const campaignToRow = (c, orgId) => ({
  id: c.id, org_id: orgId, name: c.name,
  description: c.description || "", promo: c.promo || "",
  enrollment_url: c.enrollmentUrl || "",
  active: c.active !== false,
  commission_type: c.commissionType === "percent" ? "percent" : "flat",
  commission_amount: Number(c.commissionAmount) || 0,
  ...(c.legacyKey ? { legacy_key: c.legacyKey } : {}),
});
export const campaignFromRow = (r) => ({
  id: r.id, legacyKey: r.legacy_key || null, name: r.name,
  description: r.description || "", promo: r.promo || "",
  enrollmentUrl: r.enrollment_url || "", active: r.active !== false,
  commissionType: r.commission_type === "percent" ? "percent" : "flat",
  commissionAmount: Number(r.commission_amount) || 0,
});

// Membership has a composite key (campaign_id, rep_id) rather than an id,
// so the store carries a synthetic one to keep list handling uniform.
export const memberKey = (campaignId, repId) => `${campaignId}:${repId}`;
export const campaignMemberToRow = (m, orgId) => ({
  campaign_id: m.campaignId, rep_id: m.repId, org_id: orgId,
});
export const campaignMemberFromRow = (r) => ({
  id: memberKey(r.campaign_id, r.rep_id), campaignId: r.campaign_id, repId: r.rep_id,
});

export const campaignDocFromRow = (r) => ({
  id: r.id, campaignId: r.campaign_id, name: r.name, path: r.storage_path,
  mime: r.mime_type || "", size: r.size_bytes ?? null, uploadedBy: r.uploaded_by || null,
  ts: r.created_at ? Date.parse(r.created_at) : Date.now(),
});
