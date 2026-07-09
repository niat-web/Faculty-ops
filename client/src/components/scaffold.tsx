// Scaffold-first loading primitives. The philosophy: a page's STRUCTURE (title, filter bar, table
// headers, card frames, section titles) renders instantly on open; only the data-dependent leaf
// regions shimmer until the fetch resolves. These helpers are the shimmer leaves that slot into an
// already-rendered structure — so there's no full-page skeleton swap and no layout shift.
import { Skeleton } from "./Skeleton";

// A single inline shimmer line — drop in where a value/number/text will land.
export function ShimmerLine({ w = "60%", h = "14px", className = "" }: { w?: string | number; h?: string | number; className?: string }) {
  return <Skeleton width={w} height={h} className={className} />;
}

// Shimmer rows for a REAL <tbody> (keeps the page's own <thead>/columns). `colSpan` should match the
// table's column count so widths line up. Renders `rows` shimmering <tr>s.
export function SkeletonRows({ rows = 8, cols = 5, cellClass = "px-5 py-3.5" }: { rows?: number; cols?: number; cellClass?: string }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={`sk-${r}`} className="border-b border-slate-50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className={cellClass}><Skeleton width={c === 0 ? "70%" : "50%"} height="14px" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Shimmer list items (for card lists that aren't tables) — avatar + two text lines.
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton width="36px" height="36px" borderRadius="9999px" />
          <div className="min-w-0 flex-1 space-y-1.5"><Skeleton width="60%" height="12px" /><Skeleton width="40%" height="10px" /></div>
          <Skeleton width="40px" height="12px" />
        </li>
      ))}
    </ul>
  );
}

// Shimmer block for a chart/plot area (donut, ring, bars) — a centered rounded block sized to the area.
export function SkeletonChart({ height = 160, round = false }: { height?: number; round?: boolean }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: height }}>
      <Skeleton width={round ? `${height}px` : "100%"} height={`${height}px`} borderRadius={round ? "9999px" : "12px"} />
    </div>
  );
}

// Shimmer for a form field VALUE (keeps the real label above it, which the page renders).
export function SkeletonField() {
  return <Skeleton width="100%" height="38px" borderRadius="10px" />;
}
