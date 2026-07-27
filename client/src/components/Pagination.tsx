import { ChevronLeft, ChevronRight } from "lucide-react";

export const PER_OPTIONS = [50, 100, 200, 500, 1000];

/** Page numbers to show — up to 7 buttons centred on the current page. */
function pageNumbers(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  let start = Math.max(1, page - 2);
  let end = Math.min(pages, start + 4);
  start = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export default function Pagination({ page, pages, per, total, onPage, onPer }: {
  page: number; pages: number; per: number; total?: number;
  onPage: (p: number) => void; onPer: (n: number) => void;
}) {
  const nums = pageNumbers(page, pages);
  const from = total != null && total > 0 ? (page - 1) * per + 1 : 0;
  const to = total != null ? Math.min(page * per, total) : 0;

  return (
    <div className="table-pagination-bar flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-gray-200 bg-gray-50/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-xs font-medium text-gray-500">Rows per page</span>
          <select
            value={per}
            onChange={(e) => onPer(Number(e.target.value))}
            className="input h-8 w-[76px] cursor-pointer py-1 text-xs tabular-nums"
            aria-label="Rows per page"
          >
            {PER_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {total != null && (
          <span className="text-sm tabular-nums text-gray-600">
            {total > 0 ? (
              <>Showing <span className="font-medium text-gray-900">{from}–{to}</span> of <span className="font-medium text-gray-900">{total.toLocaleString()}</span></>
            ) : (
              <span className="text-gray-500">0 results</span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="btn btn-outline btn-sm gap-1 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="hidden items-center gap-0.5 sm:flex">
          {nums[0] > 1 && (
            <>
              <PageBtn n={1} active={page === 1} onClick={() => onPage(1)} />
              {nums[0] > 2 && <span className="px-1 text-xs text-gray-400">…</span>}
            </>
          )}
          {nums.map((n) => (
            <PageBtn key={n} n={n} active={n === page} onClick={() => onPage(n)} />
          ))}
          {nums[nums.length - 1] < pages && (
            <>
              {nums[nums.length - 1] < pages - 1 && <span className="px-1 text-xs text-gray-400">…</span>}
              <PageBtn n={pages} active={page === pages} onClick={() => onPage(pages)} />
            </>
          )}
        </div>

        <span className="px-2 text-xs tabular-nums text-gray-500 sm:hidden">{page} / {pages}</span>

        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="btn btn-outline btn-sm gap-1 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function PageBtn({ n, active, onClick }: { n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-xs font-semibold tabular-nums transition-colors ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {n}
    </button>
  );
}
