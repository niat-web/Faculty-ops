import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Plus, Download, Upload, Save, Star, X, Network, RefreshCw, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
import Papa from "papaparse";
import { api, API_BASE } from "../api";
import { useAuth, LIFECYCLE_LABEL } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import { useToast } from "../toast";
import { useConfirm, usePrompt } from "../confirm";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import ScrollSelect from "../components/ScrollSelect";
import MultiSelect from "../components/MultiSelect";
import { useSort, SortHeader } from "../components/SortHeader";

const LIFECYCLE_ORDER = ["ONBOARDING", "IN_TRAINING", "CONFIRMED", "TRANSFER", "EXIT_IN_PROGRESS", "EXITED", "REHIRED"];

// Field filters (multi-select) live in a right-side drawer (draft → applied on "Apply").
type Filters = { status: string[]; campus: string[]; department: string[]; managerId: string[]; minTraining: string };
const EMPTY_FILTERS: Filters = { status: [], campus: [], department: [], managerId: [], minTraining: "" };
const oneOf = (v: string | null): string[] => (v ? [v] : []);

export default function InstructorsPage() {
  const { user } = useAuth();
  const isOps = user!.role === "OPS_ADMIN";
  const canManage = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER";
  // Ops/SM/CM can change a row's status inline (server enforces row-level scope for CMs).
  const canEditStatus = canManage || user!.role === "CAPABILITY_MANAGER";
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const dq = useDebouncedValue(q, 300);
  // Lifecycle scope quick-filter: "active" (default — excludes Exited + Exit in Progress), "all", "exited".
  const [scope, setScope] = useState<"active" | "all" | "exited">(searchParams.get("status") ? "all" : "active");
  const sort = useSort();
  const initialFilters: Filters = {
    status: oneOf(searchParams.get("status")), campus: oneOf(searchParams.get("campus")),
    department: oneOf(searchParams.get("department")), managerId: oneOf(searchParams.get("managerId")), minTraining: "",
  };
  const [applied, setApplied] = useState<Filters>(initialFilters);
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [cms, setCms] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [importing, setImporting] = useState<any[] | null>(null);
  const [views, setViews] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function filterParams() {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (applied.status.length) p.set("status", applied.status.join(","));
    if (applied.campus.length) p.set("campus", applied.campus.join(","));
    if (applied.department.length) p.set("department", applied.department.join(","));
    if (applied.managerId.length) p.set("managerId", applied.managerId.join(","));
    if (applied.minTraining) p.set("minTraining", applied.minTraining);
    if (sort.sort && sort.dir) { p.set("sort", sort.sort); p.set("dir", sort.dir); }
    // A specific status overrides the scope; otherwise apply the active/exited scope.
    if (!applied.status.length && scope !== "all") p.set("scope", scope);
    p.set("excludeStaff", "1"); // Instructors page = teaching instructors only (matches the table)
    return p;
  }
  function loadList() { setReloadKey((k) => k + 1); }
  function loadViews() { api.get("/settings/views").then((r) => setViews(r.views)).catch(() => {}); }
  useEffect(() => {
    api.get("/instructors/campuses").then((r) => setCampuses(r.campuses)).catch(() => {});
    api.get("/instructors/departments").then((r) => setDepartments(r.departments)).catch(() => {});
    loadViews();
    if (canManage) api.get("/mapping").then((r) => setCms(r.cms)).catch(() => {});
  }, []);
  useEffect(() => {
    const ac = new AbortController();
    setSelected({});
    const p = filterParams(); p.set("page", String(page)); p.set("per", String(per));
    api.get(`/instructors?${p}`, { signal: ac.signal })
      .then((r) => { setData(r); setErr(null); if (page > r.pages && r.pages >= 1) setPage(r.pages); })
      .catch((e) => { if (!isAbort(e)) setErr(e.message || "Failed to load instructors"); });
    return () => ac.abort();
  }, [dq, applied, scope, page, per, reloadKey, sort.sort, sort.dir]);

  const scopeNote = user!.role === "CAPABILITY_MANAGER" ? "Showing only your assigned instructors." : user!.role === "INSTRUCTOR" ? "Showing your own profile." : "Showing all instructors across NIAT campuses.";

  const ids = Object.keys(selected).filter((k) => selected[k]);

  function exportCsv(onlySelected = false) {
    const p = onlySelected && ids.length ? new URLSearchParams({ ids: ids.join(",") }) : filterParams();
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/instructors/export.csv${p.toString() ? `?${p}` : ""}`;
    a.download = "instructors.csv";
    document.body.appendChild(a); a.click(); a.remove();
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => setImporting(r.data as any[]) });
    e.target.value = "";
  }
  function applyView(query: string) {
    const p = new URLSearchParams(query);
    setQ(p.get("q") || "");
    const f: Filters = { status: oneOf(p.get("status")), campus: oneOf(p.get("campus")), department: oneOf(p.get("department")), managerId: oneOf(p.get("managerId")), minTraining: p.get("minTraining") || "" };
    setApplied(f); setDraft(f);
    setScope((p.get("scope") as any) || (p.get("status") ? "all" : "active")); setPage(1);
  }
  // Drawer (draft → applied), mirroring the Users page.
  const activeFilterCount = Object.values(applied).filter((v) => (Array.isArray(v) ? v.length : v)).length;
  function openDrawer() { setDraft(applied); setDrawer(true); }
  function applyFilters() { setApplied(draft); if (draft.status.length) setScope("all"); setPage(1); setDrawer(false); }
  function clearFilters() { setApplied(EMPTY_FILTERS); setDraft(EMPTY_FILTERS); setPage(1); }
  async function saveView() {
    const name = await prompt({ title: "Save view", message: "Name this view:", placeholder: "e.g. In-training at Aurora", confirmText: "Save", required: true });
    if (!name) return;
    const p = filterParams();
    try { await api.post("/settings/views", { name, query: p.toString() }); toast.success("View saved."); loadViews(); } catch (e: any) { toast.error(e.message); }
  }
  async function delView(id: string) { try { await api.del(`/settings/views/${id}`); loadViews(); } catch {} }

  async function bulkReassign() {
    if (!ids.length) return;
    if (!(await confirm({ title: "Reassign instructors?", message: `Reassign ${ids.length} instructor(s)?`, confirmText: "Reassign", danger: false }))) return;
    try { const r = await api.post("/mapping/reassign", { instructorIds: ids, managerId: bulkTarget || null }); toast.success(`Reassigned ${r.changed} instructor(s).`); setSelected({}); loadList(); } catch (e: any) { toast.error(e.message); }
  }
  async function bulkSetStatus() {
    if (!ids.length || !bulkStatus) return;
    if (!(await confirm({ title: "Change status?", message: `Set ${ids.length} instructor(s) to ${LIFECYCLE_LABEL[bulkStatus]}?`, confirmText: "Update", danger: false }))) return;
    try { const r = await api.post("/instructors/bulk", { instructorIds: ids, status: bulkStatus }); toast.success(`Updated ${r.changed} instructor(s).`); setSelected({}); loadList(); } catch (e: any) { toast.error(e.message); }
  }
  async function removeInstructor(i: any) {
    if (!(await confirm({ title: "Delete instructor?", message: `Delete ${i.name} (${i.employeeId})? This cannot be undone.` }))) return;
    try { await api.del(`/instructors/${i.id}`); toast.success("Instructor deleted."); loadList(); } catch (e: any) { toast.error(e.message); }
  }
  // Inline status change — optimistic, reverts on error. Persists a lifecycle event server-side.
  function setRowStatus(id: string, status: string) {
    setData((d: any) => d ? { ...d, instructors: d.instructors.map((x: any) => x.id === id ? { ...x, status } : x) } : d);
  }
  async function changeStatus(i: any, status: string) {
    if (status === i.status) return;
    const prev = i.status;
    setRowStatus(i.id, status);
    try { await api.post(`/instructors/${i.id}/lifecycle`, { status }); toast.success(`${i.name} → ${LIFECYCLE_LABEL[status] || status}`); }
    catch (e: any) { toast.error(e.message || "Failed to update status"); setRowStatus(i.id, prev); }
  }

  const rows: any[] = data?.instructors || [];
  const allOnPage = rows.length > 0 && rows.every((i) => selected[i.id]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Instructors <span className="text-base font-medium text-slate-400">· {data?.total ?? "…"}</span></h1><p className="text-sm text-slate-500">{scopeNote}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9 text-sm" placeholder="Name, ID, campus…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <button onClick={() => exportCsv(false)} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</button>
          {isOps && <button onClick={() => fileRef.current?.click()} className="btn btn-ghost btn-sm"><Upload className="h-4 w-4" /> Import CSV</button>}
          <button onClick={openDrawer} className="btn btn-ghost btn-sm shrink-0">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilterCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && <button onClick={clearFilters} className="text-sm font-medium text-rose-600 hover:text-rose-700">Clear filters</button>}
          {isOps && <button onClick={() => setAdding(true)} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Add instructor</button>}
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
        </div>
      </div>

      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Saved views:</span>
          {views.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs">
              <button onClick={() => applyView(v.query)} className="flex items-center gap-1 font-medium text-slate-600 hover:text-brand-700"><Star className="h-3 w-3" /> {v.name}</button>
              <button onClick={() => delView(v.id)} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-rose-600"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      {canManage && ids.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-brand-200 bg-brand-50/50 p-3">
          <span className="text-sm font-medium text-brand-700">{ids.length} selected</span>
          <div className="flex items-center gap-1">
            <div className="w-44"><ScrollSelect value={bulkTarget} placeholder="— Unassigned —" onChange={setBulkTarget}
              options={[{ value: "", label: "— Unassigned —" }, ...cms.map((c) => ({ value: c.id, label: c.name }))]} /></div>
            <button onClick={bulkReassign} className="btn btn-ghost btn-sm"><Network className="h-4 w-4" /> Reassign</button>
          </div>
          <div className="flex items-center gap-1">
            <select className="input h-8 w-40 py-1 text-xs" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              <option value="">Set status…</option>{Object.entries(LIFECYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={bulkSetStatus} disabled={!bulkStatus} className="btn btn-ghost btn-sm disabled:opacity-40"><RefreshCw className="h-4 w-4" /> Apply</button>
          </div>
          <button onClick={() => exportCsv(true)} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export selected</button>
          <button onClick={() => setSelected({})} className="btn btn-ghost btn-sm">Clear</button>
        </div>
      )}

      {err && <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={loadList} className="btn btn-ghost btn-sm">Retry</button></div>}

      <div className="card overflow-hidden">
        {/* Quick lifecycle scope — defaults to Active (excludes Exited + Exit in Progress). */}
        {!applied.status && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
              {([["active", "Active", data?.counts?.active], ["all", "All", data?.counts?.all], ["exited", "Exited", data?.counts?.exited]] as const).map(([key, label, count]) => (
                <button key={key} onClick={() => { setScope(key); setPage(1); }}
                  className={`rounded-md px-2.5 py-1 transition ${scope === key ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {label}{count != null && <span className="ml-1 opacity-60">{count}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {canManage && <th className="w-10 px-5 py-3"><input type="checkbox" checked={allOnPage} onChange={(e) => { const v = e.target.checked; const next = { ...selected }; rows.forEach((i) => (next[i.id] = v)); setSelected(next); }} /></th>}
                <SortHeader label="Employee ID" k="employeeId" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <SortHeader label="Name" k="name" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <SortHeader label="Campus" k="campus" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <SortHeader label="Department" k="department" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <SortHeader label="Manager" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <SortHeader label="Training" k="training" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <SortHeader label="Status" k="status" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                {isOps && <th className="sticky right-0 z-20 border-l border-slate-100 bg-slate-50 px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i: any) => (
                <tr key={i.id} className="group hover:bg-slate-50">
                  {canManage && <td className="px-5 py-3"><input type="checkbox" checked={!!selected[i.id]} onChange={(e) => setSelected((s) => ({ ...s, [i.id]: e.target.checked }))} /></td>}
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{i.employeeId}</td>
                  <td className="px-5 py-3 font-medium"><Link to={`/app/instructors/${i.id}`} className="text-brand-700 hover:underline">{i.name}</Link></td>
                  <td className="px-5 py-3 text-slate-500">{i.campus || "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{i.department || "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{i.managerName || "—"}</td>
                  <td className="px-5 py-3">{i.training == null ? <span className="text-slate-300">—</span> : <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(Number(i.training), 100)}%` }} /></div><span className="text-xs text-slate-500">{i.training}%</span></div>}</td>
                  <td className="px-5 py-3">
                    {canEditStatus ? (
                      <select value={i.status} onChange={(e) => changeStatus(i, e.target.value)} title="Change status" className="cursor-pointer rounded-full border-0 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 outline-none ring-1 ring-inset ring-transparent transition hover:ring-brand-200 focus:ring-2 focus:ring-brand-300">
                        {(LIFECYCLE_ORDER.includes(i.status) ? LIFECYCLE_ORDER : [i.status, ...LIFECYCLE_ORDER]).map((s) => <option key={s} value={s}>{LIFECYCLE_LABEL[s] || s}</option>)}
                      </select>
                    ) : (
                      <span className="chip chip-status">{LIFECYCLE_LABEL[i.status] || i.status}</span>
                    )}
                  </td>
                  {isOps && (
                    <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-5 py-3 group-hover:bg-slate-50">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(i)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => removeInstructor(i)} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data && <Pagination page={page} pages={data.pages} per={per} total={data.total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />}

      {adding && <AddInstructorModal cms={cms} onClose={() => setAdding(false)} onDone={() => { setAdding(false); loadList(); }} />}
      {editing && <EditInstructorModal inst={editing} cms={cms} onClose={() => setEditing(null)} onDone={() => { setEditing(null); loadList(); }} />}
      {importing && <ImportModal rows={importing} onClose={() => setImporting(null)} onDone={() => { setImporting(null); loadList(); }} />}

      {/* Right-side filter drawer (mirrors the Users page) */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filters</h2>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div><label className="label">Status</label>
                <MultiSelect values={draft.status} onChange={(v) => setDraft({ ...draft, status: v })} placeholder="All statuses"
                  options={Object.entries(LIFECYCLE_LABEL).map(([k, v]) => ({ value: k, label: v }))} /></div>
              <div><label className="label">Campus</label>
                <MultiSelect values={draft.campus} onChange={(v) => setDraft({ ...draft, campus: v })} placeholder="All campuses"
                  options={campuses.map((c) => ({ value: c, label: c }))} /></div>
              <div><label className="label">Department</label>
                <MultiSelect values={draft.department} onChange={(v) => setDraft({ ...draft, department: v })} placeholder="All departments"
                  options={departments.map((d) => ({ value: d, label: d }))} /></div>
              {canManage && (
                <div><label className="label">Manager</label>
                  <MultiSelect values={draft.managerId} onChange={(v) => setDraft({ ...draft, managerId: v })} placeholder="All managers"
                    options={cms.map((c) => ({ value: c.id, label: c.name }))} /></div>
              )}
              <div><label className="label">Min training %</label>
                <input type="number" min={0} max={100} className="input" placeholder="e.g. 50" value={draft.minTraining} onChange={(e) => setDraft({ ...draft, minTraining: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setDraft(EMPTY_FILTERS)} className="btn btn-ghost btn-sm">Clear all</button>
              <div className="flex gap-2">
                <button onClick={saveView} className="btn btn-ghost btn-sm"><Save className="h-4 w-4" /> Save view</button>
                <button onClick={applyFilters} className="btn btn-primary btn-sm">Apply filters</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddInstructorModal({ cms, onClose, onDone }: any) {
  const [f, setF] = useState({ employeeId: "", name: "", email: "", campus: "", status: "ONBOARDING", managerId: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true); setErr(null);
    try { await api.post("/instructors", { ...f, managerId: f.managerId || null }); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add instructor" onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div><label className="label">Employee ID</label><input className="input" value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)} /></div>
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label className="label">Campus</label><input className="input" value={f.campus} onChange={(e) => set("campus", e.target.value)} /></div>
        <div><label className="label">Capability Manager</label>
          <ScrollSelect value={f.managerId} placeholder="— Unassigned —" onChange={(v) => set("managerId", v)}
            options={[{ value: "", label: "— Unassigned —" }, ...(cms || []).map((c: any) => ({ value: c.id, label: c.name }))]} />
        </div>
        <div><label className="label">Status</label><select className="input" value={f.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(LIFECYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="flex justify-end gap-2 pt-1"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Create"}</button></div>
      </div>
    </Modal>
  );
}

function EditInstructorModal({ inst, cms, onClose, onDone }: any) {
  const [f, setF] = useState({ name: inst.name || "", email: inst.email || "", campus: inst.campus || "", status: inst.status || "ONBOARDING", managerId: inst.managerId || "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true); setErr(null);
    try { await api.patch(`/instructors/${inst.id}`, { ...f, managerId: f.managerId || null }); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Edit ${inst.name}`} onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div><label className="label">Employee ID</label><input className="input bg-slate-50" value={inst.employeeId} disabled /></div>
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label className="label">Campus</label><input className="input" value={f.campus} onChange={(e) => set("campus", e.target.value)} /></div>
        <div><label className="label">Capability Manager</label>
          <ScrollSelect value={f.managerId} placeholder="— Unassigned —" onChange={(v) => set("managerId", v)}
            options={[{ value: "", label: "— Unassigned —" }, ...(cms || []).map((c: any) => ({ value: c.id, label: c.name }))]} />
        </div>
        <div><label className="label">Status</label><select className="input" value={f.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(LIFECYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="flex justify-end gap-2 pt-1"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button></div>
      </div>
    </Modal>
  );
}

function ImportModal({ rows, onClose, onDone }: any) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  async function go() {
    setBusy(true); setErr(null);
    try { const r = await api.post("/instructors/import", { rows }); setResult(r); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  function downloadTemplate() {
    const csv = Papa.unparse([{ employeeId: "EMP001", name: "Jane Doe", email: "jane@org.in", campus: "Hyderabad", status: "Onboarding", manager: "" }]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "instructors-template.csv";
    document.body.appendChild(a); a.click(); a.remove();
  }
  return (
    <Modal title="Import instructors from CSV" onClose={onClose} wide>
      {result ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Imported: {result.created} created · {result.updated} updated · {result.skipped} skipped.</div>
          {result.errors?.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="mb-1 font-semibold">{result.errors.length} row(s) skipped:</div>
              <ul className="space-y-0.5">{result.errors.map((e: any, i: number) => <li key={i}>Row {e.row}: {e.error}</li>)}</ul>
            </div>
          )}
          <div className="flex justify-end"><button onClick={onDone} className="btn btn-primary btn-sm">Done</button></div>
        </div>
      ) : (
        <div className="space-y-3">
          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">{rows.length} row(s) parsed. Matched/created by <b>employeeId</b>; a <b>manager</b> column assigns a Capability Manager by name; columns matching field labels become values.</p>
            <button onClick={downloadTemplate} className="btn btn-ghost btn-sm shrink-0"><Download className="h-4 w-4" /> Template</button>
          </div>
          <div className="max-h-60 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-400"><tr>{cols.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 8).map((r: any, i: number) => <tr key={i}>{cols.map((c) => <td key={c} className="px-3 py-1.5 text-slate-600">{String(r[c] ?? "")}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {rows.length > 8 && <p className="text-xs text-slate-400">…and {rows.length - 8} more.</p>}
          <div className="flex justify-end gap-2"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy} onClick={go} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Importing…" : `Import ${rows.length} row(s)`}</button></div>
        </div>
      )}
    </Modal>
  );
}
