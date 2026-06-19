// FacultyOps brand mark + wordmark.
// Mark: a graduation cap (mortarboard) with a tassel — the academic "faculty"
//       identity — set in a rounded gradient badge.
// Props: light (for dark backgrounds), subtitle (show "NIAT Campus Suite"),
//        compact (mark only), className.
export default function Logo({ light = false, subtitle = false, compact = false, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${
          light
            ? "bg-white/15 ring-1 ring-white/30"
            : "bg-gradient-to-br from-brand-500 to-brand-700 ring-1 ring-white/10"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          {/* mortarboard board */}
          <path d="M12 3.6 L22 8 L12 12.4 L2 8 Z" fill="white" />
          {/* head band (cap base) */}
          <path
            d="M6.4 9.9 V13.7 c0 1.75 2.5 3.1 5.6 3.1 s5.6 -1.35 5.6 -3.1 V9.9"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
            fill="none"
          />
          {/* tassel */}
          <path d="M21.2 8.3 V12.9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="21.2" cy="13.9" r="1.15" fill="white" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className={`block text-[15px] font-extrabold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
            Faculty<span className={light ? "text-brand-200" : "text-brand-600"}>Ops</span>
          </span>
          {subtitle && (
            <span className={`block text-[10px] font-semibold uppercase tracking-wider ${light ? "text-brand-200/80" : "text-slate-400"}`}>
              NIAT Campus Suite
            </span>
          )}
        </span>
      )}
    </span>
  );
}
