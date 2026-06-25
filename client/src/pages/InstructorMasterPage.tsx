import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, Download, Upload, Plus, Pencil, Trash2, X } from "lucide-react";
import Papa from "papaparse";
import { api, API_BASE } from "../api";
import { ROLE_LABEL, LIFECYCLE_LABEL, useAuth } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import Loading from "../components/Loading";
import ScrollSelect from "../components/ScrollSelect";
import MultiSelect from "../components/MultiSelect";
import { useSort, SortHeader } from "../components/SortHeader";

type Column = { key: string; label: string; source: "core" | "manager" | "value"; type: string; options?: string[]; editable: boolean };
type Meta = { columns: Column[]; managers: { id: string; name: string }[]; filters: { departments: string[]; payrolls: string[]; regions: string[]; campuses: string[] } };
type Filters = { managerId: string[]; department: string[]; payroll: string[]; region: string[]; campus: string[] };
const EMPTY: Filters = { managerId: [], department: [], payroll: [], region: [], campus: [] };

export default function InstructorMasterPage() {
  const { user } = useAuth();
  const isOps = user?.role === "OPS_ADMIN";
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [importing, setImporting] = useState<any[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [drawer, setDrawer] = useState(false);
  const [scope, setScope] = useState<"active" | "all" | "exited">("active");
  const [counts, setCounts] = useState<{ all: number; active: number; exited: number }>({ all: 0, active: 0, exited: 0 });
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);

  const [edit, setEdit] = useState<{ id: string; key: string } | null>(null);

  // Role filter (deep-linked from the Roles page): /app/instructors/master?role=OPS_ADMIN
  const [searchParams, setSearchParams] = useSearchParams();
  const [role, setRole] = useState(searchParams.get("role") || "");
  useEffect(() => { setRole(searchParams.get("role") || ""); setPage(1); }, [searchParams]);
  function clearRole() { const sp = new URLSearchParams(searchParams); sp.delete("role"); setSearchParams(sp, { replace: true }); }

  useEffect(() => { api.get("/master/meta").then(setMeta).catch((e) => setErr(e.message)); }, []);

  // Build the query string shared by the list fetch and the CSV export.
  const sort = useSort();
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (role) p.set("role", role);
    if (applied.managerId.length) p.set("managerId", applied.managerId.join(","));
    if (applied.department.length) p.set("department", applied.department.join(","));
    if (applied.payroll.length) p.set("payroll", applied.payroll.join(","));
    if (applied.region.length) p.set("region", applied.region.join(","));
    if (applied.campus.length) p.set("campus", applied.campus.join(","));
    if (sort.sort && sort.dir) { p.set("sort", sort.sort); p.set("dir", sort.dir); }
    p.set("scope", scope);
    return p;
  }, [dq, applied, scope, role, sort.sort, sort.dir]);

  useEffect(() => {
    const ac = new AbortController();
    const p = new URLSearchParams(query);
    p.set("page", String(page)); p.set("per", String(per));
    api.get(`/master?${p}`, { signal: ac.signal })
      .then((r) => { setRows(r.instructors); setTotal(r.total); setCounts(r.counts || { all: 0, active: 0, exited: 0 }); setErr(null); })
      .catch((e) => { if (!isAbort(e)) setErr(e.message); });
    return () => ac.abort();
  }, [query, page, per, reloadKey]);

  const pages = Math.max(1, Math.ceil(total / per));
  const managerName = useMemo(() => Object.fromEntries((meta?.managers || []).map((m) => [m.id, m.name])), [meta]);
  const activeCount = Object.values(applied).filter((a) => a.length).length;

  function openDrawer() { setDraft(applied); setDrawer(true); }
  function applyFilters() { setApplied(draft); setPage(1); setDrawer(false); }
  function clearAll() { setApplied(EMPTY); setDraft(EMPTY); setPage(1); }
  function reload() { setReloadKey((k) => k + 1); }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => setImporting(r.data as any[]) });
    e.target.value = "";
  }
  async function removeInstructor(row: any) {
    if (!(await confirm({ title: "Delete instructor?", message: `Delete ${row.name} (${row.employeeId})? This cannot be undone.` }))) return;
    try { await api.del(`/instructors/${row.id}`); toast.success("Instructor deleted."); reload(); } catch (e: any) { toast.error(e.message); }
  }

  async function save(row: any, col: Column, raw: string) {
    setEdit(null);
    const cur = col.source === "manager" ? (row.managerId || "") : (row[col.key] ?? "");
    if (String(cur) === String(raw)) return;
    const prevRow = { ...row };
    setRows((rs) => rs.map((r) => {
      if (r.id !== row.id) return r;
      if (col.source === "manager") return { ...r, managerId: raw, managerName: raw ? (managerName[raw] || "") : "" };
      return { ...r, [col.key]: raw };
    }));
    try {
      await api.post("/master/cell", { instructorId: row.id, key: col.key, value: raw });
    } catch (e: any) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? prevRow : r)));
      toast.error(e.message || "Failed to save");
    }
  }

  if (err && !meta) return <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={() => location.reload()} className="btn btn-ghost btn-sm">Reload</button></div>;
  if (!meta) return <Loading />;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instructor Master</h1>
          <p className="text-sm text-slate-500">Full master sheet — click any cell to edit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9 text-sm" placeholder="Search name, ID, email…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          {role && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
              Role: {ROLE_LABEL[role] || role}
              <button onClick={clearRole} className="rounded-full p-0.5 hover:bg-brand-200" title="Clear role filter"><X className="h-3 w-3" /></button>
            </span>
          )}
          <button onClick={openDrawer} className="btn btn-ghost btn-sm shrink-0">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>}
          </button>
          {activeCount > 0 && <button onClick={clearAll} className="text-sm font-medium text-slate-500 hover:text-rose-600">Clear filters</button>}
          <a href={`${API_BASE}/api/master/export.csv${query.toString() ? `?${query}` : ""}`} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</a>
          {isOps && <button onClick={() => fileRef.current?.click()} className="btn btn-ghost btn-sm"><Upload className="h-4 w-4" /> Import CSV</button>}
          {isOps && <button onClick={() => setAdding(true)} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Add instructor</button>}
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
        </div>
      </div>

      {err &&<div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={() => setReloadKey((k) => k + 1)} className="btn btn-ghost btn-sm">Retry</button></div>}

      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-500">{total} instructor(s)</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {([["active", "Active", counts.active], ["all", "All", counts.all], ["exited", "Exited", counts.exited]] as const).map(([key, label, n]) => (
              <button
                key={key}
                onClick={() => { setScope(key); setPage(1); }}
                className={`rounded-md px-3 py-1 font-medium transition ${scope === key ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {label} <span className={scope === key ? "text-brand-500" : "text-slate-400"}>{n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {meta.columns.map((c, i) => (
                  <Fragment key={c.key}>
                    <SortHeader label={c.label} k={c.source === "manager" ? undefined : c.key} state={sort} onToggle={sort.toggle}
                      className={`sticky top-0 bg-slate-50 px-3 py-3 font-semibold ${i === 0 ? "left-0 z-30" : i === 1 ? "left-[120px] z-30" : "z-20"}`} />
                    {/* Migrated from the Instructors list: Campus + Training quick-view columns, right after Name. */}
                    {i === 1 && <SortHeader label="Campus" k="campus" state={sort} onToggle={sort.toggle} className="sticky top-0 z-20 bg-slate-50 px-3 py-3 font-semibold" />}
                    {i === 1 && <th className="sticky top-0 z-20 bg-slate-50 px-3 py-3 font-semibold">Training</th>}
                  </Fragment>
                ))}
                {isOps && <th className="sticky right-0 top-0 z-30 border-l border-slate-100 bg-slate-50 px-3 py-3 text-right font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="group hover:bg-slate-50">
                  {meta.columns.map((c, i) => {
                    const sticky = i === 0 ? "sticky left-0 z-10 bg-white group-hover:bg-slate-50" : i === 1 ? "sticky left-[120px] z-10 bg-white group-hover:bg-slate-50" : "";
                    const display = c.source === "manager" ? (row.managerName || "—") : (row[c.key] === "" || row[c.key] == null ? "—" : row[c.key]);
                    const isEditing = edit?.id === row.id && edit?.key === c.key;
                    const editable = c.editable || (isOps && c.key === "employeeId"); // super admin may edit Employee ID
                    // Employee ID + Name open the instructor details view (migrated from the Instructors list).
                    const isLink = c.key === "employeeId" || c.key === "name";
                    return (
                      <Fragment key={c.key}>
                      <td className={`px-3 py-2 ${sticky} ${i === 0 ? "font-medium" : ""}`} style={i === 0 ? { minWidth: 120 } : i === 1 ? { minWidth: 160 } : undefined}>
                        {isLink ? (
                          <Link to={`/app/instructors/${row.id}`} className={`block max-w-[280px] truncate px-2 py-1 font-medium text-brand-700 hover:underline ${c.key === "employeeId" ? "font-mono text-xs" : ""}`} title={String(display)}>{display}</Link>
                        ) : isEditing ? (
                          <CellEditor col={c} managers={meta.managers} value={c.source === "manager" ? (row.managerId || "") : String(row[c.key] ?? "")} onCommit={(v) => save(row, c, v)} onCancel={() => setEdit(null)} />
                        ) : (
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => editable && setEdit({ id: row.id, key: c.key })}
                            className={`block w-full max-w-[280px] truncate rounded px-2 py-1 text-left ${editable ? "cursor-text hover:bg-brand-50" : "cursor-default text-slate-500"} ${display === "—" ? "text-slate-300" : ""}`}
                            title={typeof display === "string" ? display : ""}
                          >
                            {display}
                          </button>
                        )}
                      </td>
                      {/* Campus + Training quick-view columns (migrated from the Instructors list). */}
                      {i === 1 && (
                        <td className="px-3 py-2 text-slate-500">{row.campus || <span className="text-slate-300">—</span>}</td>
                      )}
                      {i === 1 && (
                        <td className="px-3 py-2">
                          {row.training == null ? <span className="text-slate-300">—</span> : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(Number(row.training), 100)}%` }} /></div>
                              <span className="text-xs text-slate-500">{row.training}%</span>
                            </div>
                          )}
                        </td>
                      )}
                      </Fragment>
                    );
                  })}
                  {isOps && (
                    <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-3 py-2 text-right group-hover:bg-slate-50">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(row)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => removeInstructor(row)} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={meta.columns.length + 2 + (isOps ? 1 : 0)} className="px-5 py-10 text-center text-slate-400">No instructors match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pages={pages} per={per} total={total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />

      {adding && <AddInstructorModal managers={meta.managers} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {editing && <EditInstructorModal inst={editing} managers={meta.managers} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      {importing && <ImportModal rows={importing} onClose={() => setImporting(null)} onDone={() => { setImporting(null); reload(); }} />}

      {/* Right-side filter drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filters</h2>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div><label className="label">Capability Manager</label>
                <MultiSelect values={draft.managerId} onChange={(v) => setDraft({ ...draft, managerId: v })} options={meta.managers.map((m) => ({ value: m.id, label: m.name }))} placeholder="All managers" /></div>
              <div><label className="label">Department</label>
                <MultiSelect values={draft.department} onChange={(v) => setDraft({ ...draft, department: v })} options={meta.filters.departments.map((d) => ({ value: d, label: d }))} placeholder="All departments" /></div>
              <div><label className="label">Payroll</label>
                <MultiSelect values={draft.payroll} onChange={(v) => setDraft({ ...draft, payroll: v })} options={meta.filters.payrolls.map((d) => ({ value: d, label: d }))} placeholder="All" /></div>
              <div><label className="label">Contribution Region</label>
                <MultiSelect values={draft.region} onChange={(v) => setDraft({ ...draft, region: v })} options={meta.filters.regions.map((d) => ({ value: d, label: d }))} placeholder="All regions" /></div>
              <div><label className="label">Work Location</label>
                <MultiSelect values={draft.campus} onChange={(v) => setDraft({ ...draft, campus: v })} options={meta.filters.campuses.map((d) => ({ value: d, label: d }))} placeholder="All locations" /></div>
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

// Inline cell editor — type-aware (dropdown / manager picker / date / number / text).
function CellEditor({ col, managers, value, onCommit, onCancel }: { col: Column; managers: { id: string; name: string }[]; value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const base = "w-full min-w-[140px] rounded border border-brand-400 px-2 py-1 text-sm outline-none ring-2 ring-brand-100";

  if (col.source === "manager") {
    const options = [{ value: "", label: "— unassigned —" }, ...managers.map((m) => ({ value: m.id, label: m.name }))];
    return <ScrollSelect autoOpen value={value} options={options} placeholder="— unassigned —" onChange={onCommit} onClose={onCancel} className={`${base} flex items-center justify-between gap-2`} />;
  }
  if (col.type === "DROPDOWN") {
    const opts = col.options || [];
    const extra = value && !opts.includes(value) ? [{ value, label: value }] : []; // keep an out-of-list current value selectable
    const options = [{ value: "", label: "— select —" }, ...extra, ...opts.map((o) => ({ value: o, label: o }))];
    return <ScrollSelect autoOpen value={value} options={options} onChange={onCommit} onClose={onCancel} className={`${base} flex items-center justify-between gap-2`} />;
  }
  return (
    <input
      autoFocus
      type={col.type === "NUMBER" ? "number" : "text"}
      defaultValue={value}
      className={base}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }}
    />
  );
}

// Add a new instructor — migrated from the Instructors page (POST /instructors).
function AddInstructorModal({ managers, onClose, onDone }: { managers: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
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
            options={[{ value: "", label: "— Unassigned —" }, ...(managers || []).map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        <div><label className="label">Status</label><select className="input" value={f.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(LIFECYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="flex justify-end gap-2 pt-1"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Create"}</button></div>
      </div>
    </Modal>
  );
}

// Edit an instructor's core fields — migrated from the Instructors page (PATCH /instructors/:id).
function EditInstructorModal({ inst, managers, onClose, onDone }: { inst: any; managers: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
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
            options={[{ value: "", label: "— Unassigned —" }, ...(managers || []).map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        <div><label className="label">Status</label><select className="input" value={f.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(LIFECYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="flex justify-end gap-2 pt-1"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button></div>
      </div>
    </Modal>
  );
}

// CSV import — migrated from the Instructors page (POST /instructors/import).
function ImportModal({ rows, onClose, onDone }: { rows: any[]; onClose: () => void; onDone: () => void }) {
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
