// Local (device) calendar-date string, e.g. "2026-07-08" — NOT the same as
// `d.toISOString().slice(0,10)`, which reports the UTC date and silently
// rolls over to the next day hours before local midnight in any timezone
// west of UTC (all of the US). That mismatch is why an evening door could
// land on "tomorrow"'s sheet, or a manager checking late would see today
// look empty — every "today" in the app must go through this helper.
export function localDay(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Calendar-date string in a SPECIFIC IANA timezone (e.g. a rep's stored
// "America/Chicago"), not the viewing browser's timezone — needed so a
// rep's day resets at midnight where THEY are, even if an admin in another
// timezone is looking at their sheet, and so a server-side job can compute
// the same boundary without a browser at all.
export function localDayInTZ(tz, d = new Date()) {
  if (!tz) return localDay(d);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return localDay(d); // unknown/invalid tz string — fall back rather than throw
  }
}

// Common IANA zones for a US-focused rep roster (kept short and readable).
export const US_TIMEZONES = [
  { tz: "America/New_York", lab: "Eastern (New York)" },
  { tz: "America/Chicago", lab: "Central (Chicago)" },
  { tz: "America/Denver", lab: "Mountain (Denver)" },
  { tz: "America/Phoenix", lab: "Mountain, no DST (Phoenix)" },
  { tz: "America/Los_Angeles", lab: "Pacific (Los Angeles)" },
  { tz: "America/Anchorage", lab: "Alaska (Anchorage)" },
  { tz: "Pacific/Honolulu", lab: "Hawaii (Honolulu)" },
];

// Best-effort guess at the ADMIN's own device timezone — used only to
// pre-select a sensible default when creating a new user, never to infer
// a rep's actual timezone for them.
export function guessTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
  catch { return "America/New_York"; }
}
