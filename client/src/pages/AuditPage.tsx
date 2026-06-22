import { useEffect, useMemo, useState } from "react";
import { Search, Download, SlidersHorizontal, X } from "lucide-react";
import { api, API_BASE } from "../api";
import { ROLE_LABEL } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import Pagination from "../components/Pagination";
import MultiSelect from "../components/MultiSelect";

const ACTIONS = ["FIELD_EDIT", "FIELD_ADD", "FIELD_ARCHIVE", "MAPPING_CHANGE", "LIFECYCLE_CHANGE", "NOTE_ADD", "REQUEST_DECISION", "REQUEST_DELETE", "INSTRUCTOR_CREATE", "INSTRUCTOR_DELETE", "USER_CREATE", "USER_UPDATE", "USER_DELETE"];
const ROLES = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"];

type Filters = { action: string[]; department: string[]; managerId: string[]; actorRole: string[]; from: string; to: string };
const EMPTY: Filters = { action: [], department: [], managerId: [], actorRole: [], from: "", to: "" };

export default function AuditPage() {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [cms, setCms] = useState<any[]>([]);

  useEffect(() => {
    api.get("/instructors/departments").then((r) => setDepartments(r.departments)).catch(() => {});
    api.get("/mapping").then((r) => setCms(r.cms)).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (applied.action.length) p.set("action", applied.action.join(","));
    if (applied.department.length) p.set("department", applied.department.join(","));
    if (applied.managerId.length) p.set("managerId", applied.managerId.join(","));
    if (applied.actorRole.length) p.set("actorRole", applied.actorRole.join(","));
    if (applied.from) p.set("from", applied.from);
    if (applied.to) p.set("to", applied.to);
    return p;
  }, [dq, applied]);

  useEffect(() => {
    const ac = new AbortController();
    const p = new URLSearchParams(query); p.set("page", String(page)); p.set("per", String(per));
    api.get(`/audit?${p}`, { signal: ac.signal }).then((r) => { setData(r); setErr(null); }).catch((e) => { if (!isAbort(e)) setErr(e.message); });
    return () => ac.abort();
  }, [query, page, per]);

  const activeCount = Object.values(applied).filter((v) => (Array.isArray(v) ? v.length : v)).length;
  function openDrawer() { setDraft(applied); setDrawer(true); }
  function applyFilters() { setApplied(draft); setPage(1); setDrawer(false); }
  function clearAll() { setApplied(EMPTY); setDraft(EMPTY); setPage(1); }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Audit Log <span className="text-base font-medium text-slate-400">· {data?.total ?? "…"}</span></h1><p className="text-sm text-slate-500">Every change across the system, newest first.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9 text-sm" placeholder="Instructor, actor, field, value, reason…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <button onClick={openDrawer} className="btn btn-ghost btn-sm shrink-0">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>}
          </button>
          {activeCount > 0 && <button onClick={clearAll} className="text-sm font-medium text-slate-500 hover:text-rose-600">Clear filters</button>}
          <a href={`${API_BASE}/api/audit/export.csv?${query}`} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</a>
        </div>
      </div>
      {err && <div className="card p-4 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">When</th><th className="px-5 py-3">Who</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Instructor</th><th className="px-5 py-3">Field</th><th className="px-5 py-3">Change</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Proof</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.entries.map((a: any) => (
                <tr key={a.id} className="hover:bg-slate-50 align-top">
                  <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{a.actorName}{a.actorRole && <div className="text-[11px] text-slate-400">{ROLE_LABEL[a.actorRole] || a.actorRole}</div>}</td>
                  <td className="px-5 py-3"><span className="chip chip-gray">{a.action.replace(/_/g, " ").toLowerCase()}</span></td>
                  <td className="px-5 py-3 text-slate-600">{a.instructorName || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{a.fieldName || "—"}</td>
                  <td className="px-5 py-3 text-xs">{a.oldValue || a.newValue ? <span><span className="text-slate-400 line-through">{a.oldValue || "—"}</span> → <span className="text-slate-700">{a.newValue || "—"}</span></span> : "—"}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{a.reason || "—"}</td>
                  <td className="px-5 py-3 text-xs">{a.proofPath ? <a href={`${API_BASE}/api/audit/proof/${encodeURIComponent(a.proofPath)}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">view</a> : "—"}</td>
                </tr>
              ))}
              {data && !data.entries.length && <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">No audit entries match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {data && <Pagination page={page} pages={data.pages} per={per} total={data.total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />}

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filters</h2>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div><label className="label">Action</label>
                <MultiSelect values={draft.action} onChange={(v) => setDraft({ ...draft, action: v })} options={ACTIONS.map((a) => ({ value: a, label: a.replace(/_/g, " ").toLowerCase() }))} placeholder="All actions" /></div>
              <div><label className="label">Department</label>
                <MultiSelect values={draft.department} onChange={(v) => setDraft({ ...draft, department: v })} options={departments.map((d) => ({ value: d, label: d }))} placeholder="All departments" /></div>
              <div><label className="label">Capability Manager</label>
                <MultiSelect values={draft.managerId} onChange={(v) => setDraft({ ...draft, managerId: v })} options={cms.map((c) => ({ value: c.id, label: c.name }))} placeholder="All managers" /></div>
              <div><label className="label">Changed by (role)</label>
                <MultiSelect values={draft.actorRole} onChange={(v) => setDraft({ ...draft, actorRole: v })} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] || r }))} placeholder="All roles" /></div>
              <div className="border-t border-slate-100 pt-4">
                <label className="label">Date range</label>
                <div className="flex items-center gap-2">
                  <input type="date" className="input" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
                  <span className="text-slate-400">→</span>
                  <input type="date" className="input" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                </div>
              </div>
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
