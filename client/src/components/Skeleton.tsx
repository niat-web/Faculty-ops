// Shimmer placeholder block. Use <Skeleton width="200px" height="16px" /> wherever a content
// placeholder is wanted. (The .skeleton CSS lives in index.css.)
export function Skeleton({ width, height, borderRadius = "6px", className = "" }: {
  width?: string | number; height?: string | number; borderRadius?: string; className?: string;
}) {
  return <div className={`skeleton ${className}`} style={{ width, height, borderRadius }} />;
}

// Shimmer table inside a card — drop-in placeholder for a list/table while its data loads.
export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex gap-6 border-b border-slate-100 bg-slate-50 px-5 py-3">
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} width={`${100 / cols}%`} height="12px" />)}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-6 px-5 py-3.5">
            {Array.from({ length: cols }, (_, c) => <Skeleton key={c} width={`${100 / cols}%`} height="14px" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Full list-page placeholder: the REAL title/subtitle render instantly (no flash of blank page),
// with a shimmer filter bar + table below while the data loads in the background.
export function ListPageSkeleton({ title, subtitle, rows = 8, cols = 5, filters = true }: {
  title: string; subtitle?: string; rows?: number; cols?: number; filters?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {filters && (
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <Skeleton width="240px" height="38px" borderRadius="10px" />
          <Skeleton width="140px" height="38px" borderRadius="10px" />
        </div>
      )}
      <TableSkeleton rows={rows} cols={cols} />
    </div>
  );
}
