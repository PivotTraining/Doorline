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
