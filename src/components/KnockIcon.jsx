// A small "fist rapping on a door" mark — the literal action the whole
// product is built around. Same brand gradient/line language as Logo.jsx,
// with impact arcs that pulse outward so it reads as motion, not a static
// icon.
export default function KnockIcon({ size = 22, animate = true, title = "Knock" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title} style={{ display: "block", flex: "none" }}>
      <defs>
        <linearGradient id="knock-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e90fa" />
          <stop offset="1" stopColor="#7bb8ff" />
        </linearGradient>
      </defs>
      {/* door panel */}
      <rect x="13" y="3" width="15" height="27" rx="2.2" fill="url(#knock-grad)" opacity="0.16" />
      <rect x="13" y="3" width="15" height="27" rx="2.2" fill="none" stroke="url(#knock-grad)" strokeWidth="1.6" />
      {/* impact arcs, pulsing outward from the knock point */}
      <g className={animate ? "knock-pulse" : undefined} stroke="url(#knock-grad)" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M7.5 11 a6 6 0 0 0 0 10" />
        <path d="M4 9 a10 10 0 0 0 0 14" />
      </g>
      {/* fist, mid-knock against the door edge */}
      <rect x="9" y="12.5" width="8.5" height="9" rx="4.2" fill="url(#knock-grad)" />
    </svg>
  );
}
