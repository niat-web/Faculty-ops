export const PER_OPTIONS = [50, 100, 200, 500, 1000];

export default function Pagination({ page, pages, per, total, onPage, onPer }: {
  page: number; pages: number; per: number; total?: number;
  onPage: (p: number) => void; onPer: (n: number) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <select value={per} onChange={(e) => onPer(Number(e.target.value))} className="input h-8 w-[76px] py-1 text-xs">
          {PER_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {total != null && <span className="text-xs text-gray-500">{total} total</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs">Page {page} of {pages}</span>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn btn-outline btn-sm disabled:opacity-40">Prev</button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="btn btn-outline btn-sm disabled:opacity-40">Next</button>
      </div>
    </>
  );
}
