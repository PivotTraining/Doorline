// ============================================================
// Campaign model + rep ID codes (pure, unit-tested logic).
//
// Campaigns live in the org's existing `products` jsonb column, so this
// needed no schema change. The column historically held plain strings
// (just the campaign name); we now store rich objects but stay fully
// backward-compatible — a legacy string is read as { name }.
// ============================================================

// A stable, human-friendly ID code for a rep, derived from their profile
// UUID so it needs no stored column and never changes. e.g. "7A3F9C".
export function repCode(id) {
  if (!id) return "------";
  return String(id).replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase().padEnd(6, "0");
}

// Normalize any stored entry (legacy string OR object) into a full campaign.
export function normalizeCampaign(c, i = 0) {
  if (typeof c === "string") return { id: `c${i}`, name: c, description: "", promo: "", enrollmentUrl: "", active: true };
  return {
    id: c.id || `c${i}`,
    name: c.name || "",
    description: c.description || "",
    promo: c.promo || "",
    enrollmentUrl: c.enrollmentUrl || "",
    active: c.active !== false,
  };
}

export function normalizeCampaigns(list) {
  return (Array.isArray(list) ? list : []).map(normalizeCampaign);
}

// Build a rep's personalized enrollment link: any {code}/{id}/{rep}
// placeholder in the campaign URL is replaced with the rep's ID code so
// each door knocker hands out a link tagged to them.
export function personalizedEnrollUrl(url, code) {
  if (!url) return "";
  const withCode = url.replace(/\{(code|id|rep|repid|agent)\}/gi, code);
  // If there's no placeholder but there is a URL, append the code as ?ref=
  if (withCode === url && code) {
    return url + (url.includes("?") ? "&" : "?") + "ref=" + encodeURIComponent(code);
  }
  return withCode;
}
