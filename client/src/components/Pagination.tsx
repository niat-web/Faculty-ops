export const PER_OPTIONS = [50, 100, 200, 500, 1000];

// Standard list footer: page-size dropdown on the left, page nav on the right.
export default function Pagination({ page, pages, per, total, onPage, onPer }: {
  page: number; pages: number; per: number; total?: number;
  onPage: (p: number) => void; onPer: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
      <div className="flex items-center gap-2">
        <select value={per} onChange={(e) => onPer(Number(e.target.value))} className="input h-8 w-28 py-1 text-xs">
          {PER_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {total != null && <span className="text-xs">{total} total</span>}
      </div>
      <div className="flex items-center gap-2">
        <span>Page {page} of {pages}</span>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn btn-ghost btn-sm disabled:opacity-40">← Prev</button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="btn btn-ghost btn-sm disabled:opacity-40">Next →</button>
      </div>
    </div>
  );
}
