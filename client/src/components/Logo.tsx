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

// FacultyOps wordmark lockup — the EXACT treatment used in the sidebar: the "F" monogram followed by
// a gradient-filled "acultyOps" so the whole thing reads as one continuous "FacultyOps". Use this
// anywhere the brand appears (sidebar, login, reset…) so every logo spot is identical.
export function Wordmark({ logoSize = 38, textClassName = "text-2xl", className = "" }: { logoSize?: number; textClassName?: string; className?: string }) {
  return (
    <span className={`flex items-center ${className}`}>
      <Logo size={logoSize} className="shrink-0 drop-shadow-sm" />
      {/* Negative margin pulls the text over the logo SVG's internal right padding so the "F" and
          "acultyOps" sit flush; the text uses the SAME blue gradient as the logo. */}
      <span className={`-ml-2 bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] bg-clip-text font-bold leading-none tracking-tight text-transparent ${textClassName}`}>acultyOps</span>
    </span>
  );
}
