// Skeleton shown instantly while the instructors list data streams in.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded bg-slate-200" />
        <div className="h-9 w-32 rounded-lg bg-slate-200" />
      </div>
      {/* filter toolbar */}
      <div className="flex flex-wrap gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 w-40 rounded-lg bg-slate-100" />)}
      </div>
      <div className="card overflow-hidden p-0">
        <div className="h-12 border-b border-slate-200 bg-slate-100" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3">
            <div className="h-4 w-44 shrink-0 rounded bg-slate-200" />
            <div className="h-4 w-24 shrink-0 rounded bg-slate-100" />
            <div className="h-4 w-28 shrink-0 rounded bg-slate-100" />
            <div className="h-4 flex-1 rounded bg-slate-100" />
            <div className="h-5 w-20 shrink-0 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
