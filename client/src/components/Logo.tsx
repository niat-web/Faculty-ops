import { useId } from "react";

// FacultyOps brand mark — a gradient "squircle" badge holding a clean, modern graduation
// mortarboard: a bold flat board with softly-rounded corners, a simple cap base, and a
// single amber tassel as the accent. Self-contained SVG (unique gradient ids), crisp at
// any size; used in the sidebar, login screen and favicon.
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
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.26" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* gradient badge + subtle top gloss */}
      <rect width="48" height="48" rx="13" fill={`url(#bg-${uid})`} />
      <rect width="48" height="48" rx="13" fill={`url(#gloss-${uid})`} />

      {/* cap base — the part that sits on the head (slightly recessed tone for depth) */}
      <path d="M16.5 23 H31.5 V29.4 C31.5 30.8 28.4 32.6 24 32.6 C19.6 32.6 16.5 30.8 16.5 29.4 Z" fill="#ffffff" fillOpacity="0.82" />

      {/* mortarboard — bold flat board with softly rounded corners */}
      <path d="M24 13 L40.5 20 L24 27 L7.5 20 Z" fill="#ffffff" stroke="#ffffff" strokeWidth="1.6" strokeLinejoin="round" />

      {/* button on top of the board */}
      <circle cx="24" cy="20" r="1.4" fill="#7C3AED" />

      {/* tassel — the single pop of colour */}
      <path d="M40.5 20 V30.6" stroke="#FBBF24" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="40.5" cy="32.6" r="2.3" fill="#FBBF24" />
    </svg>
  );
}
