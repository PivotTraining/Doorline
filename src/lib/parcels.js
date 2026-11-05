// Parcel-list import (pure — unit-tested in test/api.test.mjs).
//
// This is what puts a homeowner's name on a door BEFORE anyone knocks. The
// map used to only know about doors a rep had already tapped; feeding it a
// county parcel extract (or any address list with coordinates) turns it into
// the street as it actually is.
//
// Every county exports different header names, so columns are detected by
// alias rather than demanded in a fixed order. Anything unrecognised is
// ignored, and a row without usable coordinates is reported as skipped
// rather than dropped silently or guessed at — an address placed at the
// wrong point is worse than an address that never imported.

const ALIASES = {
  addr:      ["addr", "address", "street address", "property address", "site address", "full address", "street", "location"],
  ownerName: ["owner", "owner name", "owner_name", "ownername", "homeowner", "home owner", "owner 1", "primary owner", "taxpayer"],
  lat:       ["lat", "latitude", "y", "lat_dd"],
  lng:       ["lng", "lon", "long", "longitude", "x", "lon_dd"],
  serviced:  ["serviced", "customer", "existing customer", "is_customer", "account"],
};

const norm = (h) => String(h || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

// Pick, for each logical field, the first header that matches one of its
// aliases. Exact matches win over substring ones so a sheet carrying both
// "owner" and "owner mailing address" resolves the way a human would read it.
export function detectColumns(headers) {
  const present = (headers || []).map((h) => ({ raw: h, n: norm(h) }));
  const out = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const exact = present.find((h) => aliases.includes(h.n));
    const fuzzy = exact || present.find((h) => aliases.some((a) => h.n === a || h.n.startsWith(a + " ")));
    if (fuzzy) out[field] = fuzzy.raw;
  }
  return out;
}

const TRUTHY = new Set(["1", "true", "yes", "y", "t"]);

// Turn parsed CSV rows into parcels ready for store.importParcels().
// `cols` may be supplied to override detection (the admin UI lets a user
// correct a mis-detected column rather than re-export their file).
export function mapParcelRows(rows, headers, cols) {
  const c = { ...detectColumns(headers), ...(cols || {}) };
  const parcels = [];
  const skipped = [];
  for (const r of rows || []) {
    const lat = Number(String(r[c.lat] ?? "").trim());
    const lng = Number(String(r[c.lng] ?? "").trim());
    const addr = String(r[c.addr] ?? "").trim();
    // Reject the null island and out-of-range values as well as blanks: a
    // 0,0 in a parcel export means "no geocode", not "off the coast of Ghana".
    const placed =
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0);
    if (!placed || !addr) { skipped.push({ addr, reason: !addr ? "no address" : "no usable coordinates" }); continue; }
    const rawServiced = c.serviced ? String(r[c.serviced] ?? "").trim().toLowerCase() : "";
    parcels.push({
      addr,
      ownerName: String(r[c.ownerName] ?? "").trim(),
      lat, lng,
      serviced: TRUTHY.has(rawServiced),
    });
  }
  return { parcels, skipped, cols: c };
}
