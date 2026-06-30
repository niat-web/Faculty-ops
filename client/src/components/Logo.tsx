import { useId } from "react";

// FacultyOps brand mark — standalone "F" monogram (no background badge/card; transparent).
// A bold rounded F in a blue gradient with a brighter sky-blue crossbar as the accent.
// Self-contained SVG with a unique gradient id, crisp from 16px favicon to login hero.
// Used in the sidebar, login screen and header.
export default function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  const uid = useId().replace(/[:]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="FacultyOps">
      <defs>
        <linearGradient id={`f-${uid}`} x1="6" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1D4ED8" />
          <stop offset="0.55" stopColor="#2563EB" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      {/* stem */}
      <rect x="9" y="7" width="9" height="34" rx="4.5" fill={`url(#f-${uid})`} />
      {/* top arm */}
      <rect x="9" y="7" width="30" height="9" rx="4.5" fill={`url(#f-${uid})`} />
      {/* mid arm — brighter sky-blue accent */}
      <rect x="9" y="20" width="20" height="9" rx="4.5" fill="#38BDF8" />
    </svg>
  );
}
