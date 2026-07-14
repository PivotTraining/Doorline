// ============================================================
// Commission math (pure, unit-tested). "Track what's owed" only — this
// computes what each rep earned so it can be shown and exported; actual
// payment happens outside the app.
// ============================================================

// Index campaigns by name so a deal (which stores its campaign as `product`)
// can look up its commission rule.
export function campaignByName(campaigns) {
  const m = new Map();
  for (const c of campaigns || []) if (c.name) m.set(c.name, c);
  return m;
}

// Commission owed on a single deal, in dollars (rounded to the cent).
export function dealCommission(deal, campMap) {
  const c = campMap.get(deal?.product);
  if (!c) return 0;
  const amt = Number(c.commissionAmount) || 0;
  if (amt <= 0) return 0;
  if (c.commissionType === "percent") return Math.round((Number(deal.value) || 0) * amt) / 100;
  return amt; // flat per deal
}

// Aggregate per-rep earnings over a set of deals.
// -> Map<repId, { deals, value, commission }>
export function repEarnings(deals, campaigns) {
  const campMap = campaignByName(campaigns);
  const out = new Map();
  for (const d of deals || []) {
    const cur = out.get(d.repId) || { deals: 0, value: 0, commission: 0 };
    cur.deals += 1;
    cur.value += Number(d.value) || 0;
    cur.commission += dealCommission(d, campMap);
    out.set(d.repId, cur);
  }
  // guard against float drift on the accumulated commission
  for (const v of out.values()) v.commission = Math.round(v.commission * 100) / 100;
  return out;
}
