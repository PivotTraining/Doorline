// Doorline mark: an arched doorway with a location-pin knob, in the brand
// gradient. Self-contained SVG — works at any size, light or dark.
export default function Logo({ size = 30, title = "Doorline" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title} style={{ display: "block", flex: "none" }}>
      <defs>
        <linearGradient id="dl-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e90fa" />
          <stop offset="1" stopColor="#7bb8ff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#dl-grad)" />
      {/* arched doorway */}
      <path d="M10 25 V14 a6 6 0 0 1 12 0 V25 Z" fill="#ffffff" opacity="0.96" />
      <rect x="9.2" y="24.2" width="13.6" height="1.9" rx="0.95" fill="#ffffff" opacity="0.96" />
      {/* location-pin doorknob */}
      <path d="M18.4 15.8 a2.2 2.2 0 0 1 2.2 2.2 c0 1.6-2.2 3.9-2.2 3.9 s-2.2-2.3-2.2-3.9 a2.2 2.2 0 0 1 2.2-2.2 Z" fill="#2e90fa" />
      <circle cx="18.4" cy="18" r="0.85" fill="#ffffff" />
    </svg>
  );
}
