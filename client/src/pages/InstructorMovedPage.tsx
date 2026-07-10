import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, RefreshCw, SlidersHorizontal, Download, X } from "lucide-react";
import Papa from "papaparse";
import { api } from "../api";
import { useToast } from "../toast";
import { isAbort, useStickyThead } from "../hooks";
import SearchInput from "../components/SearchInput";
import MultiSelect from "../components/MultiSelect";

// Instructor Moved — everyone whose Payroll = University (moved to a University payroll entity). ALWAYS
// lists all University-payroll people, regardless of the Master's payroll-visibility control. A Capability
// Manager sees only their own reportees. Data is from the live Master set (Mongo mirror of Darwinbox).
type MovedRow = { id: string | null; employeeId: string; name: string; university: string; campus: string; department: string; manager: string; exited: boolean };
type Filters = { department: string[]; university: string[]; manager: string[] };
const EMPTY: Filters = { department: [], university: [], manager: [] };
const EMPTY_LABEL = "— Not set —"; // filter value used for rows with a blank university
const STATUSES = ["Active", "Exited"] as const;
const DEFAULT_STATUS = new Set<string>(["Active"]); // Exited is hidden by default

export default function InstructorMovedPage() {
  const toast = useToast();
  const [rows, setRows] = useState<MovedRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  // Status is an inline checkbox dropdown next to the count. DEFAULT = Active only (Exited hidden).
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set(DEFAULT_STATUS));
  const [statusOpen, setStatusOpen] = useState(false);
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // The full list is small (all University-payroll people); we fetch it once and filter/search in-memory
  // so the Filters drawer works off the REAL values in this table.
  useEffect(() => {
    const ac = new AbortController();
    setLoaded(false);
    api.get("/master/moved", { signal: ac.signal })
      .then((r) => { setRows(r.items || []); setLoaded(true); })
      .catch((e) => { if (!isAbort(e)) { toast.error(e.message); setLoaded(true); } });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth page-flow sticky header (matches the Master / Exited grids) — measure-once + rAF + translate3d.
  useStickyThead(wrapRef, theadRef, [rows.length]);

  // Facet option lists, built from the actual rows (so filters only offer real values present in the table).
  const facets = useMemo(() => {
    const depts = new Set<string>(), unis = new Set<string>(), mgrs = new Set<string>();
    for (const r of rows) {
      if (r.department) depts.add(r.department);
      unis.add(r.university || EMPTY_LABEL);
      if (r.manager) mgrs.add(r.manager);
    }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return { departments: sort(depts), universities: sort(unis), managers: sort(mgrs) };
  }, [rows]);

  const activeCount = (applied.department.length ? 1 : 0) + (applied.university.length ? 1 : 0) + (applied.manager.length ? 1 : 0);

  // Apply search + status + drawer filters in-memory.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!statusSel.has(r.exited ? "Exited" : "Active")) return false;
      if (needle && !`${r.name} ${r.employeeId} ${r.university} ${r.department}`.toLowerCase().includes(needle)) return false;
      if (applied.department.length && !applied.department.includes(r.department)) return false;
      if (applied.university.length && !applied.university.includes(r.university || EMPTY_LABEL)) return false;
      if (applied.manager.length && !applied.manager.includes(r.manager)) return false;
      return true;
    });
  }, [rows, q, applied, statusSel]);

  const statusChecked = (s: string) => statusSel.has(s);
  const toggleStatus = (s: string) => setStatusSel((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const openDrawer = () => { setDraft(applied); setDrawer(true); };
  const applyFilters = () => { setApplied(draft); setDrawer(false); };
  const clearAll = () => { setApplied(EMPTY); setDraft(EMPTY); };

  function exportCsv() {
    const data = filtered.map((r) => ({
      Name: r.name, "Employee ID": r.employeeId, "University / Campus": r.university || "",
      Department: r.department || "", "Capability Manager": r.manager || "", Status: r.exited ? "Exited" : "Active",
    }));
    const csv = Papa.unparse(data.length ? data : [{ Name: "", "Employee ID": "", "University / Campus": "", Department: "", "Capability Manager": "", Status: "" }]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "instructor-moved.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Building2 className="h-5 w-5" /></span>
          <div>
            <h1 className="text-2xl font-bold">Instructor Moved</h1>
            <p className="text-sm text-slate-500">Instructors moved to University payroll — with their university / campus.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput onSearch={(v) => setQ(v)} placeholder="Name, ID, university…" />
          <button onClick={openDrawer} className="btn btn-ghost btn-sm shrink-0">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>}
          </button>
          {activeCount > 0 && <button onClick={clearAll} className="text-sm font-medium text-rose-600 hover:text-rose-700">Clear filters</button>}
          <button onClick={exportCsv} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</button>
        </div>
      </div>

      <div className={`card flex flex-col overflow-hidden rounded-xl ${!loaded ? "min-h-[calc(100vh-14rem)]" : ""}`}>
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">
          {!loaded
            ? <span className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-500" /> Loading…</span>
            : <span>{filtered.length} instructor(s) moved to University payroll</span>}
          {/* Status quick-filter: inline text-button → checkbox dropdown. DEFAULT = Active only (Exited hidden). */}
          {loaded && (
            <span className="relative">
              <button onClick={() => setStatusOpen((o) => !o)} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                Status ({statusSel.size}/{STATUSES.length})
              </button>
              {statusOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                  <div className="absolute left-0 top-7 z-40 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-soft">
                    {STATUSES.map((s) => (
                      <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <input type="checkbox" checked={statusChecked(s)} onChange={() => toggleStatus(s)} className="h-4 w-4 cursor-pointer rounded border-slate-300" />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </span>
          )}
        </div>
        <div ref={wrapRef} className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead ref={theadRef} className="relative z-20 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Employee ID</th>
                <th className="px-5 py-3 font-semibold">University / Campus</th>
                <th className="px-5 py-3 font-semibold">Department</th>
                <th className="px-5 py-3 font-semibold">Capability Manager</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loaded && filtered.map((r) => (
                <tr key={r.employeeId} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{r.name || <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{r.employeeId}</td>
                  <td className="px-5 py-3">
                    {r.university
                      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">{r.university}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{r.department || <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-3 text-slate-600">{r.manager || <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-3">
                    {r.exited
                      ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">Exited</span>
                      : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>}
                  </td>
                </tr>
              ))}
              {!loaded && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, c) => <td key={c} className="px-5 py-3"><div className="skeleton h-4 w-full rounded" /></td>)}</tr>
              ))}
              {loaded && !filtered.length && (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-sm text-slate-400">
                  {rows.length ? "No instructors match your search / filters." : "No instructors are on University payroll yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right-side filter drawer — same pattern as the other grids; options are the REAL table values. */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onMouseDown={() => setDrawer(false)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filters</h2>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div><label className="label">Department</label>
                <MultiSelect values={draft.department} onChange={(v) => setDraft({ ...draft, department: v })} options={facets.departments.map((d) => ({ value: d, label: d }))} placeholder="All departments" /></div>
              <div><label className="label">University / Campus</label>
                <MultiSelect values={draft.university} onChange={(v) => setDraft({ ...draft, university: v })} options={facets.universities.map((u) => ({ value: u, label: u }))} placeholder="All universities" /></div>
              <div><label className="label">Capability Manager</label>
                <MultiSelect values={draft.manager} onChange={(v) => setDraft({ ...draft, manager: v })} options={facets.managers.map((m) => ({ value: m, label: m }))} placeholder="All managers" /></div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setDraft(EMPTY)} className="btn btn-ghost btn-sm">Clear</button>
              <button onClick={applyFilters} className="btn btn-primary btn-sm">Apply filters</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
