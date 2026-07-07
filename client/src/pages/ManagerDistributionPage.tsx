import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users2 } from "lucide-react";
import { useCachedGet } from "../hooks";
import { ListPageSkeleton } from "../components/Skeleton";

export default function ManagerDistributionPage() {
  const { data, loading } = useCachedGet<any>("/contribution/managers"); // cached for instant revisits
  const [q, setQ] = useState("");

  const items: any[] = data?.items || [];
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return !n ? items : items.filter((i) => i.manager.toLowerCase().includes(n));
  }, [items, q]);

  if (loading) return <ListPageSkeleton title="Capability Manager Distribution" subtitle="How many instructors report to each Capability Manager." cols={2} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Users2 className="h-6 w-6 text-brand-600" /> Capability Manager Distribution</h1>
        <p className="text-sm text-slate-500">How many instructors report to each Capability Manager.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Filter manager…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="text-sm text-slate-500"><div className="label">Totals</div>{items.length} manager(s) · {data?.grandTotal || 0} instructor(s)</div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Capability Manager</th><th className="px-5 py-3 text-right">Instructors</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <tr key={i.managerId || "na"} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800 cell-trunc" title={i.manager}>
                    {i.managerId ? <Link to={`/app/instructors/master?managerId=${i.managerId}`} className="text-brand-700 hover:underline">{i.manager}</Link> : <span className="text-slate-500">{i.manager}</span>}
                  </td>
                  <td className="px-5 py-3 text-right"><span className="chip chip-status">{i.count}</span></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={2} className="px-5 py-8 text-center text-slate-400">No managers found.</td></tr>}
            </tbody>
            {!!filtered.length && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr><td className="px-5 py-3">Grand total</td><td className="px-5 py-3 text-right">{filtered.reduce((s, i) => s + i.count, 0)}</td></tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
