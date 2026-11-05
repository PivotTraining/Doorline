// ============================================================
// Earnings taken from uploaded pay reports (pure, unit-tested).
//
// A pay report is a batch of rows, each already tied to a rep, whose
// columns are whatever the carrier or payroll export happened to contain.
// One of those columns holds the amount that rep was paid; which one is
// recorded on the batch as amountCol when it is published.
//
// This is deliberately separate from lib/commission.js. That one PROJECTS
// what a rep should earn from the deals they logged and the campaign's
// commission rule. This one reports what a pay report actually says they
// were paid. The two will disagree, and that difference is worth seeing,
// so neither is allowed to quietly stand in for the other.
// ============================================================

// Money out of a spreadsheet is rarely a clean number: "$1,234.56",
// "1 234,56", "(45.00)" for a negative, a stray space, or already a number.
export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  let s = String(value).trim();
  if (!s) return 0;
  // Accounting-style negatives: (45.00) means -45.00
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) s = "-" + paren[1];
  // Drop currency symbols, spaces and thousands separators, keep sign/decimal.
  s = s.replace(/[^\d.,\-]/g, "");
  // If both separators appear, the LAST one is the decimal point.
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // A lone comma is a decimal separator only when it is not grouping
    // (e.g. "1,50" is 1.5 but "1,500" is 1500).
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const cents = (n) => Math.round(n * 100) / 100;

// Per-rep paid totals from pay reports.
//   batches: [{ id, ts, amountCol }]
//   rows:    [{ batchId, repId, data }]
// -> Map<repId, { paid, ytd, rows }>
// A batch with no amountCol contributes nothing: it was uploaded before
// anyone said which column held the money, and guessing a column would
// invent earnings rather than report them.
export function payEarnings(batches, rows, now = Date.now()) {
  const byId = new Map();
  for (const b of batches || []) if (b && b.amountCol) byId.set(b.id, b);
  const yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();

  const out = new Map();
  for (const r of rows || []) {
    const batch = byId.get(r.batchId);
    if (!batch || !r.repId) continue;
    const amount = parseMoney(r.data?.[batch.amountCol]);
    if (!amount) continue;
    const cur = out.get(r.repId) || { paid: 0, ytd: 0, rows: 0 };
    cur.paid += amount;
    if ((batch.ts || 0) >= yearStart) cur.ytd += amount;
    cur.rows += 1;
    out.set(r.repId, cur);
  }
  for (const v of out.values()) { v.paid = cents(v.paid); v.ytd = cents(v.ytd); }
  return out;
}

// Columns from a batch that plausibly hold money, best guess first, to
// preselect the amount column instead of making someone hunt for it.
export function likelyAmountColumns(cols) {
  const score = (c) => {
    const s = String(c).toLowerCase();
    if (/(^|\b)(commission|payout|earnings|earned)\b/.test(s)) return 3;
    if (/(^|\b)(amount|pay|total|net)\b/.test(s)) return 2;
    if (/\$|usd/.test(s)) return 1;
    return 0;
  };
  return [...(cols || [])].map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}
