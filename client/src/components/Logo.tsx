import { useId } from "react";

// FacultyOps brand mark — NIAT SPI style: 32×32 rounded square, orange performance arc, white "F" monogram.
export default function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  const uid = useId().replace(/[:]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="FacultyOps">
      <defs>
        <linearGradient id={`arc-${uid}`} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF8A1E" />
          <stop offset="1" stopColor="#F25C05" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#1e293b" />
      {/* Performance arc */}
      <path
        d="M6 24 A14 14 0 0 1 24 6"
        fill="none"
        stroke={`url(#arc-${uid})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* F monogram */}
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="16" fontWeight="700" fontFamily="Plus Jakarta Sans, sans-serif">F</text>
    </svg>
  );
}

// Wordmark lockup — dark sidebar variant (white NIAT-style) or light variant.
export function Wordmark({ logoSize = 32, dark = true, className = "" }: { logoSize?: number; dark?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={logoSize} className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="flex items-baseline gap-1">
          <span className={`text-base font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>Faculty</span>
          <span className="text-base font-bold tracking-tight text-brand-400">Ops</span>
        </div>
        <div className={`text-[11px] font-medium ${dark ? "text-slate-400" : "text-slate-500"}`}>Instructor Lifecycle CRM</div>
      </div>
    </div>
  );
}
