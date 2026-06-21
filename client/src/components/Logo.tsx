import { useId } from "react";

// FacultyOps brand mark — a gradient "squircle" badge holding a stylized graduation
// mortarboard with a depth tone + an amber tassel bead for a pop of colour.
// Self-contained SVG (unique gradient ids), crisp at any size, used in the sidebar,
// login screen and favicon.
export default function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  const uid = useId().replace(/[:]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="FacultyOps">
      <defs>
        <linearGradient id={`bg-${uid}`} x1="2" y1="2" x2="46" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="0.55" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#9333EA" />
        </linearGradient>
        <linearGradient id={`gloss-${uid}`} x1="24" y1="0" x2="24" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* gradient badge + subtle top gloss */}
      <rect width="48" height="48" rx="13" fill={`url(#bg-${uid})`} />
      <rect width="48" height="48" rx="13" fill={`url(#gloss-${uid})`} />

      {/* mortarboard — board (diamond) + head piece (depth tone) */}
      <path d="M24 11.5 41 20 24 28.5 7 20 Z" fill="#ffffff" />
      <path d="M15 23 24 27.6 33 23 V30.6 C33 30.6 29.4 33.9 24 33.9 18.6 33.9 15 30.6 15 30.6 Z" fill="#ffffff" fillOpacity="0.78" />
      <circle cx="24" cy="20" r="1.5" fill="#7C3AED" />

      {/* tassel — the pop of colour */}
      <path d="M41 20 V31.4" stroke="#FCD34D" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="41" cy="33" r="2.3" fill="#FBBF24" />
    </svg>
  );
}
