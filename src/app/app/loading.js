// Route-level loading UI shown while an /app page's server data is fetching.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-200/70" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-xl bg-slate-200/70" />
        <div className="h-72 rounded-xl bg-slate-200/70" />
      </div>
    </div>
  );
}
