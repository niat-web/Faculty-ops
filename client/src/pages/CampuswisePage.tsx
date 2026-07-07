import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Building2 } from "lucide-react";
import { useCachedGet } from "../hooks";
import { ListPageSkeleton } from "../components/Skeleton";

export default function CampuswisePage() {
  const { data, loading } = useCachedGet<any>("/contribution/campuswise"); // cached for instant revisits
  const [q, setQ] = useState("");

  const items: any[] = data?.items || [];
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return !n ? items : items.filter((i) => i.campus.toLowerCase().includes(n));
  }, [items, q]);

  if (loading) return <ListPageSkeleton title="Campuswise Instructors" subtitle="Instructors per campus, split by who runs their payroll." cols={4} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 className="h-6 w-6 text-brand-600" /> Campuswise Instructors</h1>
        <p className="text-sm text-slate-500">Instructors per campus, split by who runs their payroll.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Filter campus…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="text-sm text-slate-500"><div className="label">Totals</div>{items.length} campus(es) · {data?.totals?.total || 0} instructor(s)</div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">University / Campus</th><th className="px-5 py-3 text-right">No. of Instructors</th><th className="px-5 py-3 text-right">University Payroll</th><th className="px-5 py-3 text-right">Nxtwave Payroll</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <tr key={i.campus || "(blank)"} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800 cell-trunc">
                    {i.blank
                      ? <span className="italic text-slate-400">(Blank — no work location)</span>
                      : <Link to={`/app/instructors/master?campus=${encodeURIComponent(i.campus)}`} className="text-brand-700 hover:underline" title={i.campus}>{i.campus}</Link>}
                  </td>
                  <td className="px-5 py-3 text-right"><span className="chip chip-status">{i.total}</span></td>
                  <td className="px-5 py-3 text-right text-slate-600">{i.university}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{i.nxtwave}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">No campuses found.</td></tr>}
            </tbody>
            {!!filtered.length && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr><td className="px-5 py-3">Grand total</td>
                  <td className="px-5 py-3 text-right">{filtered.reduce((s, i) => s + i.total, 0)}</td>
                  <td className="px-5 py-3 text-right">{filtered.reduce((s, i) => s + i.university, 0)}</td>
                  <td className="px-5 py-3 text-right">{filtered.reduce((s, i) => s + i.nxtwave, 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
