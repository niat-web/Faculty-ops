// Reusable skeleton placeholders that preserve the final layout, so a page appears fully structured
// immediately (never a spinner or empty whitespace) while it waits for live data.

// A single shimmering block.
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200/70 ${className}`} />;
}

// Matches a MetricTile: label + icon, big value, footer.
export function StatCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <Bar className="h-4 w-24" />
        <Bar className="h-9 w-9 rounded-lg" />
      </div>
      <Bar className="mt-4 h-8 w-20" />
      <Bar className="mt-3 h-3 w-28 bg-slate-100" />
    </div>
  );
}

// Matches a Panel that contains a chart (donut/ring/bars): title + sub + a chart-area block.
export function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      <Bar className="h-4 w-32" />
      <Bar className="mt-1.5 h-3 w-40 bg-slate-100" />
      <div className="mt-6 flex items-center justify-center">
        <Bar className="h-40 w-40 rounded-full" />
      </div>
    </div>
  );
}

// Matches a list/table panel: title + N rows (avatar + text + trailing value).
export function TableSkeleton({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      <Bar className="h-4 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="h-9 w-9 shrink-0 rounded-full" />
            <Bar className="h-3 flex-1" />
            <Bar className="h-3 w-16 shrink-0 bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Full dashboard skeleton: greeting bar → 4 stat cards → chart panels → a table. Mirrors the real grid
// (`space-y-5`, the same responsive column counts) so there is no layout shift when the data arrives.
export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between p-5">
        <div className="space-y-2"><Bar className="h-6 w-52" /><Bar className="h-3 w-72 bg-slate-100" /></div>
        <div className="hidden gap-2 sm:flex"><Bar className="h-8 w-24 rounded-lg bg-slate-100" /><Bar className="h-8 w-20 rounded-lg bg-slate-100" /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartSkeleton className="lg:col-span-2" />
        <ChartSkeleton />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      <TableSkeleton />
    </div>
  );
}

// Data-grid page skeleton (Instructor Master / Exited / Training Stats): toolbar → card (header + table
// rows) → pagination. Fills the full height like the real grid so nothing shifts when data arrives.
export function GridSkeleton({ cols = 7, rows = 12 }: { cols?: number; rows?: number }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2"><Bar className="h-6 w-44" /><Bar className="h-3 w-60 bg-slate-100" /></div>
        <div className="flex gap-2"><Bar className="h-9 w-56 rounded-lg" /><Bar className="h-9 w-24 rounded-lg bg-slate-100" /><Bar className="h-9 w-20 rounded-lg bg-slate-100" /></div>
      </div>
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3"><Bar className="h-4 w-28" /><Bar className="h-6 w-52 rounded-lg bg-slate-100" /></div>
        <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-4">
          <div className="flex gap-4">{Array.from({ length: cols }).map((_, i) => <Bar key={i} className="h-3 flex-1" />)}</div>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-4">{Array.from({ length: cols }).map((_, i) => <Bar key={i} className="h-4 flex-1 bg-slate-100" />)}</div>
          ))}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-5 py-3"><Bar className="h-8 w-28 rounded-lg bg-slate-100" /><Bar className="h-4 w-40 bg-slate-100" /></div>
      </div>
    </div>
  );
}

// Form / settings / profile skeleton: heading + card sections of label+field pairs.
export function FormSkeleton({ sections = 2, rows = 4 }: { sections?: number; rows?: number }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2"><Bar className="h-7 w-48" /><Bar className="h-3 w-64 bg-slate-100" /></div>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className="card space-y-4 p-5">
          <Bar className="h-4 w-32" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="space-y-1.5"><Bar className="h-3 w-24 bg-slate-100" /><Bar className="h-9 w-full rounded-lg" /></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Right-side drawer skeleton — matches InstructorDetailDrawer's panel while its chunk loads.
export function DrawerSkeleton() {
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-slate-200 bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between"><Bar className="h-6 w-40" /><Bar className="h-8 w-8 rounded-lg bg-slate-100" /></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-1.5"><Bar className="h-3 w-24 bg-slate-100" /><Bar className="h-8 w-full rounded-lg" /></div>
        ))}
      </div>
    </div>
  );
}

// Neutral page skeleton used as the lazy-route fallback (chunk still downloading, route unknown): a
// toolbar + a large content card, so no route ever flashes a blank white canvas.
export function PageSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Bar className="h-6 w-44" />
        <div className="flex gap-2"><Bar className="h-9 w-40 rounded-lg bg-slate-100" /><Bar className="h-9 w-24 rounded-lg bg-slate-100" /></div>
      </div>
      <div className="card min-h-0 flex-1 space-y-3 p-5">
        {Array.from({ length: 10 }).map((_, i) => <Bar key={i} className="h-5 w-full bg-slate-100" />)}
      </div>
    </div>
  );
}
