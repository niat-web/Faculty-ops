import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users2, ArrowRight } from "lucide-react";
import { useCachedGet } from "../hooks";
import { ListPageSkeleton } from "../components/Skeleton";

const enc = encodeURIComponent;

// Capability Manager Distribution — every unique DARWINBOX reporting manager and how many
// instructors report to them, counted over the same Instructor-Master population.
export default function ManagerDistributionPage() {
  const { data, loading } = useCachedGet<any>("/contribution/managers"); // grouped by Darwinbox reporting manager
  const [q, setQ] = useState("");

  const items: any[] = data?.items || [];
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return !n ? items : items.filter((i) => (i.manager || "").toLowerCase().includes(n) || (i.managerId || "").toLowerCase().includes(n));
  }, [items, q]);
  const grandTotal = useMemo(() => filtered.reduce((s, i) => s + (i.count || 0), 0), [filtered]);

  // Drill-down link into the Master, filtered by this Darwinbox reporting manager.
  const reporteesLink = (i: any) => i.managerId ? `/app/instructors/master?rmid=${enc(i.managerId)}&rmname=${enc(i.manager)}` : null;

  if (loading && !data) return <ListPageSkeleton title="Capability Manager Distribution" subtitle="Every Darwinbox reporting manager and their reportee count." cols={3} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Users2 className="h-6 w-6 text-brand-600" /> Capability Manager Distribution</h1>
        <p className="text-sm text-slate-500">Every reporting manager in Darwinbox and how many instructors report to them (from the Instructor Master data).</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Filter reporting manager…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="text-sm text-slate-500"><div className="label">Totals</div>{items.length} reporting manager(s) · {data?.grandTotal ?? 0} instructor(s)</div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Reporting Manager</th>
                <th className="px-5 py-3">Employee ID</th>
                <th className="px-5 py-3 text-right">Reportees</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i, idx) => {
                const link = reporteesLink(i);
                return (
                  <tr key={i.managerId || `na-${idx}`} className="hover:bg-slate-50">
                    <td className="max-w-[280px] px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Users2 className="h-4 w-4" /></span>
                        {link ? <Link to={link} className="min-w-0 truncate font-medium text-brand-700 hover:underline" title={i.manager}>{i.manager}</Link> : <span className="min-w-0 truncate font-medium text-slate-500" title={i.manager}>{i.manager}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{i.managerId || "—"}</td>
                    <td className="px-5 py-3 text-right"><span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{i.count}</span></td>
                    <td className="px-5 py-3 text-right">{link && <Link to={link} className="inline-flex items-center gap-1 text-brand-600 hover:underline">View reportees <ArrowRight className="h-3.5 w-3.5" /></Link>}</td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">No reporting managers.</td></tr>}
            </tbody>
            {!!filtered.length && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr><td className="px-5 py-3" colSpan={2}>Grand total</td><td className="px-5 py-3 text-right">{grandTotal}</td><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
