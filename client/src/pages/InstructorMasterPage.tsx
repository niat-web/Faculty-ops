import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, Download, Upload, Plus, Pencil, Trash2, X, CheckSquare, Inbox, RefreshCw, MoreHorizontal, ChevronDown } from "lucide-react";
import Papa from "papaparse";
import { api, API_BASE } from "../api";
import { ROLE_LABEL, LIFECYCLE_LABEL, useAuth } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import { Skeleton, TableSkeleton } from "../components/Skeleton";
import ScrollSelect from "../components/ScrollSelect";
import MultiSelect from "../components/MultiSelect";
import { useSort, SortHeader } from "../components/SortHeader";
import InstructorDetailDrawer from "../components/InstructorDetailDrawer";

type Column = { key: string; label: string; source: "core" | "manager" | "value"; type: string; options?: string[]; editable: boolean };
type MetaFilters = { departments: string[]; roles: string[]; payrolls: string[]; regions: string[]; campuses: string[]; qualifications: string[]; genders: string[]; domains: string[]; states: string[]; workspaces: string[] };
type Meta = { columns: Column[]; managers: { id: string; name: string }[]; reportingManagers: { id: string; name: string }[]; filters: MetaFilters };
type Filters = { reportingManager: string[]; managerId: string[]; department: string[]; designation: string[]; payroll: string[]; region: string[]; campus: string[]; qualification: string[]; gender: string[]; domain: string[]; state: string[]; workspace: string[] };
const EMPTY: Filters = { reportingManager: [], managerId: [], department: [], designation: [], payroll: [], region: [], campus: [], qualification: [], gender: [], domain: [], state: [], workspace: [] };

// Deep-link filters from the URL (e.g. the Contribution pages link to
// /app/instructors/master?campus=X / ?managerId=Y). Read once on mount so click-throughs
// land on the master grid with the filter already applied.
function filtersFromSearch(): Filters {
  const p = new URLSearchParams(window.location.search);
  const arr = (k: string) => (p.get(k) || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { reportingManager: arr("rmid"), managerId: arr("managerId"), department: arr("department"), designation: arr("designation"), payroll: arr("payroll"), region: arr("region"), campus: arr("campus"), qualification: arr("qualification"), gender: arr("gender"), domain: arr("domain"), state: arr("state"), workspace: arr("workspace") };
}

export default function InstructorMasterPage() {
  const { user } = useAuth();
  const isOps = user?.role === "OPS_ADMIN";
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<any>(null);
  const [importing, setImporting] = useState<any[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  // Column keys sourced LIVE from Darwinbox → read-only in the grid (only manual columns are editable).
  const [darwinboxKeys, setDarwinboxKeys] = useState<Set<string>>(new Set());
  // Department quick-filter: `deptSel` = null means "use server default" (all except the 2 support depts);
  // a Set means an explicit user selection. `allDepts`/`defaultUnchecked` come from the response.
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [defaultUnchecked, setDefaultUnchecked] = useState<string[]>([]);
  const [deptSel, setDeptSel] = useState<Set<string> | null>(null);
  const [deptOpen, setDeptOpen] = useState(false);

  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [applied, setApplied] = useState<Filters>(filtersFromSearch);
  const [draft, setDraft] = useState<Filters>(filtersFromSearch);
  const [drawer, setDrawer] = useState(false);
  const [scope, setScope] = useState<"active" | "all" | "exited">("active");
  const [counts, setCounts] = useState<{ all: number; active: number; exited: number }>({ all: 0, active: 0, exited: 0 });
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);

  const [edit, setEdit] = useState<{ empId: string; key: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null); // open instructor in the right-side drawer

  // Multi-select (bulk) mode — checkbox column + selection toolbar (Edit for all staff; Delete Ops-only).
  const [selectMode, setSelectMode] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false); // bulk-edit common-fields modal
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pageIds = useMemo(() => rows.map((r) => r.id).filter(Boolean), [rows]);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSelectAll = () => setSelected((s) => { const n = new Set(s); if (allOnPage) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id)); return n; });
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  async function bulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!(await confirm({ title: `Delete ${ids.length} instructor(s)?`, message: `This permanently deletes ${ids.length} selected instructor(s). This cannot be undone.`, confirmText: "Delete", danger: true }))) return;
    let ok = 0, fail = 0;
    for (const id of ids) { try { await api.del(`/instructors/${id}`); ok++; } catch { fail++; } }
    toast[fail ? "error" : "success"](`${ok} deleted${fail ? `, ${fail} failed` : ""}.`);
    exitSelect(); reload();
  }

  // Role filter (deep-linked from the Roles page): /app/instructors/master?role=OPS_ADMIN
  // Contribution filter (deep-linked from the Contribution page): ?contribution=<value>
  const [searchParams, setSearchParams] = useSearchParams();
  const [role, setRole] = useState(searchParams.get("role") || "");
  const [contribution, setContribution] = useState(searchParams.get("contribution") || "");
  useEffect(() => { setRole(searchParams.get("role") || ""); setContribution(searchParams.get("contribution") || ""); setPage(1); }, [searchParams]);
  function clearRole() { const sp = new URLSearchParams(searchParams); sp.delete("role"); setSearchParams(sp, { replace: true }); }
  function clearContribution() { const sp = new URLSearchParams(searchParams); sp.delete("contribution"); setSearchParams(sp, { replace: true }); }
  // Reporting-Manager deep-link (Org Chart CM click → ?rmid=<Employee ID>&rmname=<name>).
  const rmName = searchParams.get("rmname") || "";
  function clearReportingManager() {
    const sp = new URLSearchParams(searchParams); sp.delete("rmid"); sp.delete("rmname"); setSearchParams(sp, { replace: true });
    setApplied((f) => ({ ...f, reportingManager: [] })); setDraft((f) => ({ ...f, reportingManager: [] })); setPage(1);
  }

  useEffect(() => { api.get("/master/meta").then(setMeta).catch((e) => setErr(e.message)); }, []);
  // Close the Actions menu on outside click.
  useEffect(() => {
    if (!actionsOpen) return;
    const onClick = (e: MouseEvent) => { if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [actionsOpen]);

  // Sticky header during PAGE scroll: the page (<main>) scrolls vertically while the table keeps
  // its own horizontal scroll. CSS sticky can't pin the header to the page through an overflow-x
  // wrapper, so we translate the <thead> down by the page's scrollTop to keep it visually pinned.
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Build the query string shared by the list fetch and the CSV export.
  const sort = useSort();
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (role) p.set("role", role);
    if (contribution) p.set("contribution", contribution);
    if (applied.reportingManager.length) p.set("rmid", applied.reportingManager.join(","));
    if (applied.managerId.length) p.set("managerId", applied.managerId.join(","));
    if (applied.department.length) p.set("department", applied.department.join(","));
    if (applied.designation.length) p.set("designation", applied.designation.join(","));
    if (applied.payroll.length) p.set("payroll", applied.payroll.join(","));
    if (applied.region.length) p.set("region", applied.region.join(","));
    if (applied.campus.length) p.set("campus", applied.campus.join(","));
    if (applied.qualification.length) p.set("qualification", applied.qualification.join(","));
    if (applied.gender.length) p.set("gender", applied.gender.join(","));
    if (applied.domain.length) p.set("domain", applied.domain.join(","));
    if (applied.state.length) p.set("state", applied.state.join(","));
    if (applied.workspace.length) p.set("workspace", applied.workspace.join(","));
    // Department quick-filter: only send `depts` once the user has made an explicit choice; until then
    // the server applies its default (all except the 2 support departments).
    if (deptSel) p.set("depts", [...deptSel].join(","));
    if (sort.sort && sort.dir) { p.set("sort", sort.sort); p.set("dir", sort.dir); }
    p.set("scope", scope);
    return p;
  }, [dq, applied, scope, role, contribution, sort.sort, sort.dir, deptSel]);

  // Sticky header during PAGE scroll (same technique as the Training Stats grid): the page (<main>)
  // scrolls vertically while the card scrolls horizontally. CSS `position: sticky` can't pin the header
  // to the page through the overflow-x wrapper, so we translate the <thead> down by the page's scrollTop.
  useEffect(() => {
    const scroller = wrapRef.current?.closest("main") as HTMLElement | null;
    const thead = theadRef.current;
    if (!scroller || !thead) return;
    const onScroll = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const y = scroller.scrollTop - wrap.offsetTop;
      const maxShift = wrap.clientHeight - thead.offsetHeight;
      thead.style.transform = `translateY(${Math.max(0, Math.min(y, maxShift))}px)`;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => { scroller.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [meta, rows.length]);

  const [loadingRows, setLoadingRows] = useState(true);
  useEffect(() => {
    const ac = new AbortController();
    const p = new URLSearchParams(query);
    p.set("page", String(page)); p.set("per", String(per));
    setLoadingRows(true);
    api.get(`/master?${p}`, { signal: ac.signal })
      .then((r) => {
        setRows(r.instructors); setTotal(r.total); setCounts(r.counts || { all: 0, active: 0, exited: 0 });
        setDarwinboxKeys(new Set(r.darwinboxKeys || [])); setAllDepts(r.departments || []); setDefaultUnchecked(r.defaultUnchecked || []);
        setErr(null); setLoadingRows(false);
      })
      .catch((e) => { if (!isAbort(e)) { setErr(e.message); setLoadingRows(false); } });
    return () => ac.abort();
  }, [query, page, per, reloadKey]);

  const pages = Math.max(1, Math.ceil(total / per));

  const managerName = useMemo(() => Object.fromEntries((meta?.managers || []).map((m) => [m.id, m.name])), [meta]);
  const activeCount = Object.values(applied).filter((a) => a.length).length;

  // Department quick-filter helpers. Effective checked set = explicit `deptSel`, or (until the user
  // touches it) "all except the default-unchecked support departments".
  const isDeptChecked = (d: string) => (deptSel ? deptSel.has(d) : !defaultUnchecked.includes(d));
  const deptCheckedCount = deptSel ? deptSel.size : Math.max(0, allDepts.length - defaultUnchecked.length);
  function toggleDept(d: string) {
    setPage(1);
    setDeptSel((prev) => {
      const base = prev ? new Set(prev) : new Set(allDepts.filter((x) => !defaultUnchecked.includes(x)));
      base.has(d) ? base.delete(d) : base.add(d);
      return base;
    });
  }
  function setAllDeptsChecked(on: boolean) { setPage(1); setDeptSel(on ? new Set(allDepts) : new Set()); }

  // Display order: Name FIRST (sticky, clickable), Employee ID SECOND (not sticky, plain text).
  // Backend column config is untouched (CSV export etc. keep their own order).
  const displayColumns = useMemo(() => {
    const cols = [...(meta?.columns || [])];
    const nameIdx = cols.findIndex((c) => c.key === "name");
    const empIdx = cols.findIndex((c) => c.key === "employeeId");
    if (nameIdx > -1 && empIdx > -1 && empIdx < nameIdx) {
      const [emp] = cols.splice(empIdx, 1);
      cols.splice(cols.findIndex((c) => c.key === "name") + 1, 0, emp); // put Employee ID right after Name
    }
    return cols;
  }, [meta]);

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
    const cur = row[col.key] ?? "";
    if (String(cur) === String(raw)) return;
    const prevRow = { ...row };
    // Rows are keyed by employeeId (Darwinbox-only rows have no Mongo id yet).
    setRows((rs) => rs.map((r) => (r.employeeId === row.employeeId ? { ...r, [col.key]: raw } : r)));
    try {
      // Pass employeeId + name so the server can auto-create a minimal Mongo record for a Darwinbox-only row.
      const r = await api.post("/master/cell", { instructorId: row.id || null, employeeId: row.employeeId, name: row.name, key: col.key, value: raw });
      // If the server created/resolved a Mongo record, keep its id on the row for the next edit.
      if (r?.instructorId && !row.id) setRows((rs) => rs.map((x) => (x.employeeId === row.employeeId ? { ...x, id: r.instructorId } : x)));
      toast.success(`${col.label} updated${raw ? `: ${String(raw).replace(/\n/g, " ")}` : " (cleared)"}`);
    } catch (e: any) {
      setRows((rs) => rs.map((r) => (r.employeeId === row.employeeId ? prevRow : r)));
      toast.error(e.message || "Failed to save");
    }
  }

  if (err && !meta) return <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={() => location.reload()} className="btn btn-ghost btn-sm">Reload</button></div>;
  // Instant shell while columns/meta load — real header renders immediately, grid shimmers underneath.
  if (!meta) return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instructor Master</h1>
          <p className="text-sm text-slate-500">Full master sheet — click any cell to edit.</p>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton width="224px" height="36px" borderRadius="10px" />
          <Skeleton width="96px" height="36px" borderRadius="10px" />
          <Skeleton width="120px" height="36px" borderRadius="10px" />
        </div>
      </div>
      <TableSkeleton rows={12} cols={7} />
    </div>
  );

  return (
    // Normal page flow (like the Training Stats page): the PAGE (<main>) scrolls vertically, the card only
    // scrolls horizontally, and the pagination sits below the full table at the bottom of the page.
    <div className="flex flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
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
          {contribution && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
              Contribution: {contribution}
              <button onClick={clearContribution} className="rounded-full p-0.5 hover:bg-brand-200" title="Clear contribution filter"><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.reportingManager.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
              Reporting Manager: {rmName || applied.reportingManager.join(", ")}
              <button onClick={clearReportingManager} className="rounded-full p-0.5 hover:bg-brand-200" title="Clear reporting-manager filter"><X className="h-3 w-3" /></button>
            </span>
          )}
          <button onClick={openDrawer} className="btn btn-ghost btn-sm shrink-0">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>}
          </button>
          {activeCount > 0 && <button onClick={clearAll} className="text-sm font-medium text-rose-600 hover:text-rose-700">Clear filters</button>}
          <button onClick={() => (selectMode ? exitSelect() : setSelectMode(true))} className={`btn btn-sm ${selectMode ? "btn-primary" : "btn-ghost"}`}><CheckSquare className="h-4 w-4" /> {selectMode ? "Done" : "Multi-select"}</button>
          {/* Actions menu — Add instructor / Import / Export collapsed into one button. */}
          <div ref={actionsRef} className="relative">
            <button onClick={() => setActionsOpen((o) => !o)} className="btn btn-primary btn-sm"><MoreHorizontal className="h-4 w-4" /> Actions <ChevronDown className={`h-3.5 w-3.5 transition ${actionsOpen ? "rotate-180" : ""}`} /></button>
            {actionsOpen && (
              <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {isOps && <button onClick={() => { setAdding(true); setActionsOpen(false); }} className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Plus className="h-4 w-4 text-slate-400" /> Add instructor</button>}
                {isOps && <button onClick={() => { fileRef.current?.click(); setActionsOpen(false); }} className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Upload className="h-4 w-4 text-slate-400" /> Import CSV</button>}
                <a href={`${API_BASE}/api/master/export.csv${query.toString() ? `?${query}` : ""}`} onClick={() => setActionsOpen(false)} className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4 text-slate-400" /> Export CSV</a>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
        </div>
      </div>

      {err &&<div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={() => setReloadKey((k) => k + 1)} className="btn btn-ghost btn-sm">Retry</button></div>}

      {/* Selection toolbar — actions depend on role (Edit for all staff; Delete Ops-only). */}
      {selectMode && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
          <span className="text-sm font-medium text-brand-800">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setBulkOpen(true)} className="btn btn-primary btn-sm"><Pencil className="h-4 w-4" /> Edit</button>
            {isOps && <button onClick={bulkDelete} className="btn btn-danger btn-sm"><Trash2 className="h-4 w-4" /> Delete</button>}
            <button onClick={() => setSelected(new Set())} className="btn btn-ghost btn-sm">Clear</button>
          </div>
        </div>
      )}

      <div className={`card flex flex-col overflow-hidden rounded-xl ${loadingRows && !rows.length ? "min-h-[calc(100vh-13rem)]" : ""}`}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <span className="flex items-center gap-3 text-sm font-medium text-slate-500">
            {loadingRows && !rows.length ? <span className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-500" /> Loading instructors…</span> : `${total} instructor(s)`}
            {/* Department quick-filter: blue text button → checkbox dropdown of unique departments. */}
            {!!allDepts.length && (
              <span className="relative">
                <button onClick={() => setDeptOpen((o) => !o)} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                  Departments ({deptCheckedCount}/{allDepts.length})
                </button>
                {deptOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setDeptOpen(false)} />
                    <div className="absolute left-0 top-7 z-40 max-h-[60vh] w-[360px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-soft">
                      <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                        <span className="font-semibold text-slate-600">Show departments</span>
                        <span className="flex gap-3">
                          <button onClick={() => setAllDeptsChecked(true)} className="font-medium text-brand-600 hover:underline">All</button>
                          <button onClick={() => setAllDeptsChecked(false)} className="font-medium text-slate-500 hover:underline">None</button>
                        </span>
                      </div>
                      {allDepts.map((d) => (
                        <label key={d} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                          <input type="checkbox" checked={isDeptChecked(d)} onChange={() => toggleDept(d)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300" />
                          <span className="leading-snug">{d}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </span>
            )}
          </span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {([["active", "Active", counts.active], ["all", "All", counts.all], ["exited", "Exited", counts.exited]] as const).map(([key, label, n]) => (
              <button
                key={key}
                onClick={() => { setScope(key); setPage(1); }}
                className={`rounded-md px-3 py-1 font-medium transition ${scope === key ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {label} <span className={scope === key ? "text-brand-500" : "text-slate-400"}>{loadingRows && !rows.length ? "·" : n}</span>
              </button>
            ))}
          </div>
        </div>
        <div ref={wrapRef} className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead ref={theadRef} className="relative z-20 text-left text-xs uppercase tracking-wide text-slate-400 [&_th]:border-b [&_th]:border-slate-200">
              <tr>
                {selectMode && (
                  <th className="sticky left-0 z-40 w-8 min-w-[2rem] max-w-[2rem] bg-slate-50 px-2 py-3">
                    <input type="checkbox" checked={allOnPage} onChange={toggleSelectAll} title="Select all on this page" className="h-4 w-4 cursor-pointer rounded border-slate-300" />
                  </th>
                )}
                {displayColumns.map((c) => (
                  <Fragment key={c.key}>
                    <SortHeader label={c.label} k={c.source === "manager" ? undefined : c.key} state={sort} onToggle={sort.toggle}
                      className={`px-3 py-3 font-semibold ${c.editable && !darwinboxKeys.has(c.key) ? "bg-amber-50 text-amber-900" : "bg-slate-50"} ${
                        c.key === "name" ? `sticky ${selectMode ? "left-8" : "left-0"} z-30 w-[200px] min-w-[200px]`
                          : c.key === "employeeId" ? `sticky ${selectMode ? "left-[232px]" : "left-[200px]"} z-30 min-w-[130px] border-r border-slate-200`
                            : "z-20"}`} />
                    {/* Campus + Training quick-view columns sit right after the frozen Name + Employee ID pair. */}
                    {c.key === "employeeId" && <SortHeader label="Campus" k="campus" state={sort} onToggle={sort.toggle} className="z-20 bg-slate-50 px-3 py-3 font-semibold" />}
                    {c.key === "employeeId" && <th className="z-20 bg-slate-50 px-3 py-3 font-semibold">Training</th>}
                  </Fragment>
                ))}
                {isOps && <th className="sticky right-0 z-30 border-l border-slate-100 bg-slate-50 px-3 py-3 text-right font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.employeeId} className={`group bg-white transition-colors even:bg-slate-50 hover:!bg-brand-50 ${row.id && selected.has(row.id) ? "!bg-brand-50" : ""}`}>
                  {selectMode && (
                    <td className="sticky left-0 z-20 w-8 min-w-[2rem] max-w-[2rem] bg-inherit px-2 py-2">
                      {/* Only rows that exist in Mongo can be bulk-selected (Darwinbox-only rows have no record yet). */}
                      {row.id ? <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} className="h-4 w-4 cursor-pointer rounded border-slate-300" /> : <span className="text-slate-300">—</span>}
                    </td>
                  )}
                  {displayColumns.map((c) => {
                    // Name + Employee ID are both frozen while horizontally scrolling (like the Training Stats grid).
                    const sticky = c.key === "name" ? `sticky ${selectMode ? "left-8" : "left-0"} z-10 bg-inherit w-[200px] min-w-[200px]`
                      : c.key === "employeeId" ? `sticky ${selectMode ? "left-[232px]" : "left-[200px]"} z-10 bg-inherit min-w-[130px] border-r border-slate-200`
                        : "";
                    const display = row[c.key] === "" || row[c.key] == null ? "—" : row[c.key];
                    const isEditing = edit?.empId === row.employeeId && edit?.key === c.key;
                    // Darwinbox-sourced columns are read-only; only the manual FacultyOps columns are editable.
                    const editable = c.editable && !darwinboxKeys.has(c.key);
                    // Only Name opens the instructor details drawer — and only when a Mongo record exists.
                    const isLink = c.key === "name";
                    return (
                      <Fragment key={c.key}>
                      <td className={`px-3 py-2 ${sticky} ${c.key === "name" ? "font-medium" : ""}`}>
                        {isLink ? (
                          row.id
                            ? <button type="button" onClick={() => setDetailId(row.id)} className="block max-w-[280px] truncate px-2 py-1 text-left font-medium text-brand-700 hover:underline" title={String(display)}>{display}</button>
                            : <span className="block max-w-[280px] truncate px-2 py-1 font-medium text-slate-700" title={String(display)}>{display}</span>
                        ) : isEditing ? (
                          <CellEditor col={c} managers={meta.managers} value={String(row[c.key] ?? "")} onCommit={(v) => save(row, c, v)} onCancel={() => setEdit(null)} />
                        ) : (
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => editable && setEdit({ empId: row.employeeId, key: c.key })}
                            className={`block w-full max-w-[280px] truncate rounded px-2 py-1 text-left ${editable ? "cursor-text bg-amber-50 ring-1 ring-inset ring-amber-100 hover:bg-amber-100" : "cursor-default text-slate-500"} ${display === "—" ? "text-slate-300" : ""} ${c.key === "employeeId" ? "font-mono text-xs" : ""}`}
                            title={typeof display === "string" ? display : ""}
                          >
                            {display}
                          </button>
                        )}
                      </td>
                      {/* Campus + Training quick-view columns, right after the frozen Name + Employee ID. */}
                      {c.key === "employeeId" && (
                        <td className="px-3 py-2 text-slate-500">{row.campus || <span className="text-slate-300">—</span>}</td>
                      )}
                      {c.key === "employeeId" && (
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
                    <td className="sticky right-0 z-10 border-l border-slate-100 bg-inherit px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(row)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => removeInstructor(row)} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {/* While loading (fresh fetch, no rows yet) show shimmer rows that fill the grid — never a
                  tiny empty table or a premature "no instructors" message. */}
              {loadingRows && !rows.length && Array.from({ length: 18 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-slate-50">
                  {selectMode && <td className="px-2 py-3"><Skeleton width="16px" height="16px" /></td>}
                  {displayColumns.map((c) => (
                    <Fragment key={c.key}>
                      <td className={`px-3 py-3 ${c.key === "name" ? "sticky left-0 bg-white" : c.key === "employeeId" ? "sticky left-[200px] border-r border-slate-200 bg-white" : ""}`}><Skeleton width={c.key === "name" ? "80%" : "60%"} height="12px" /></td>
                      {c.key === "employeeId" && <td className="px-3 py-3"><Skeleton width="55%" height="12px" /></td>}
                      {c.key === "employeeId" && <td className="px-3 py-3"><Skeleton width="36px" height="12px" /></td>}
                    </Fragment>
                  ))}
                  {isOps && <td className="px-3 py-3"><Skeleton width="44px" height="14px" /></td>}
                </tr>
              ))}
              {!loadingRows && !rows.length && (
                <tr><td colSpan={meta.columns.length + 2 + (isOps ? 1 : 0) + (selectMode ? 1 : 0)} className="px-5 py-20 text-center">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-slate-400">
                    <Inbox className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">No instructors match these filters</p>
                    {activeCount > 0 ? <button onClick={clearAll} className="text-xs font-medium text-brand-600 hover:text-brand-700">Clear filters</button> : <p className="text-xs">Try a different search or scope.</p>}
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination sits below the full table at the bottom of the page (like Training Stats) — you
          scroll the page down through all rows and reach the page controls here. */}
      <Pagination page={page} pages={pages} per={per} total={total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />

      {detailId && <InstructorDetailDrawer instructorId={detailId} onClose={() => setDetailId(null)} onChanged={reload} onNavigate={setDetailId} />}

      {adding && <AddInstructorDrawer managers={meta.managers} columns={meta.columns} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {editing && <EditInstructorModal inst={editing} managers={meta.managers} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      {importing && <ImportModal rows={importing} onClose={() => setImporting(null)} onDone={() => { setImporting(null); reload(); }} />}
      {bulkOpen && (
        <BulkEditModal
          ids={Array.from(selected)}
          columns={meta.columns}
          managers={meta.managers}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); exitSelect(); reload(); }}
        />
      )}

      {/* Right-side filter drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filters</h2>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div><label className="label">Capability Manager</label>
                <MultiSelect values={draft.reportingManager} onChange={(v) => setDraft({ ...draft, reportingManager: v })} options={meta.reportingManagers.map((m) => ({ value: m.id, label: m.name }))} placeholder="All managers" /></div>
              <div><label className="label">Department</label>
                <MultiSelect values={draft.department} onChange={(v) => setDraft({ ...draft, department: v })} options={meta.filters.departments.map((d) => ({ value: d, label: d }))} placeholder="All departments" /></div>
              <div><label className="label">Role</label>
                <MultiSelect values={draft.designation} onChange={(v) => setDraft({ ...draft, designation: v })} options={meta.filters.roles.map((d) => ({ value: d, label: d }))} placeholder="All roles" /></div>
              <div><label className="label">Payroll</label>
                <MultiSelect values={draft.payroll} onChange={(v) => setDraft({ ...draft, payroll: v })} options={meta.filters.payrolls.map((d) => ({ value: d, label: d }))} placeholder="All" /></div>
              <div><label className="label">Contribution Region</label>
                <MultiSelect values={draft.region} onChange={(v) => setDraft({ ...draft, region: v })} options={meta.filters.regions.map((d) => ({ value: d, label: d }))} placeholder="All regions" /></div>
              <div><label className="label">Work Location</label>
                <MultiSelect values={draft.campus} onChange={(v) => setDraft({ ...draft, campus: v })} options={meta.filters.campuses.map((d) => ({ value: d, label: d }))} placeholder="All locations" /></div>
              <div><label className="label">Qualification</label>
                <MultiSelect values={draft.qualification} onChange={(v) => setDraft({ ...draft, qualification: v })} options={meta.filters.qualifications.map((d) => ({ value: d, label: d }))} placeholder="All qualifications" /></div>
              <div><label className="label">Gender</label>
                <MultiSelect values={draft.gender} onChange={(v) => setDraft({ ...draft, gender: v })} options={meta.filters.genders.map((d) => ({ value: d, label: d }))} placeholder="All" /></div>
              <div><label className="label">Domain</label>
                <MultiSelect values={draft.domain} onChange={(v) => setDraft({ ...draft, domain: v })} options={meta.filters.domains.map((d) => ({ value: d, label: d }))} placeholder="All domains" /></div>
              <div><label className="label">State</label>
                <MultiSelect values={draft.state} onChange={(v) => setDraft({ ...draft, state: v })} options={meta.filters.states.map((d) => ({ value: d, label: d }))} placeholder="All states" /></div>
              <div><label className="label">Workspace</label>
                <MultiSelect values={draft.workspace} onChange={(v) => setDraft({ ...draft, workspace: v })} options={meta.filters.workspaces.map((d) => ({ value: d, label: d }))} placeholder="All workspaces" /></div>
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
  // max-w cap + truncation keep the cell from widening when a long value is selected in a dropdown.
  const base = "w-full max-w-[280px] rounded border border-brand-400 px-2 py-1 text-sm outline-none ring-2 ring-brand-100";

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
  if (col.type === "NUMBER") {
    return (
      <input autoFocus type="number" defaultValue={value} className={base}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }} />
    );
  }
  // Text/date → an auto-growing textarea that keeps the CELL's width (doesn't widen the column) and
  // grows VERTICALLY so long values wrap and are never clipped. Esc cancels, click-away saves.
  return (
    <textarea
      autoFocus
      rows={1}
      defaultValue={value}
      ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; el.setSelectionRange(el.value.length, el.value.length); } }}
      className="block w-full resize-none overflow-hidden rounded border border-brand-400 px-2 py-1 text-sm leading-snug outline-none ring-2 ring-brand-100"
      onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
    />
  );
}

// Add a new instructor — migrated from the Instructors page (POST /instructors).
// Full Add-instructor drawer (right side, scrollable) — every master field, grouped into sections.
const ADD_CORE = new Set(["employeeId", "name", "email", "campus", "uid"]);
const ADD_REQUIRED = new Set(["employeeId", "name"]);
const ADD_TEXTAREA = new Set(["hod_interaction", "access_status", "remarks"]);
const ADD_SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Identity", keys: ["employeeId", "name", "email", "campus", "uid"] },
  { title: "Reporting & Department", keys: ["department", "designation", "reporting_manager_employee_id", "reporting_manager"] },
  { title: "Personal & Location", keys: ["phone", "doj", "qualification", "domain", "gender", "native_language", "workspace", "emp_state", "emp_district", "emp_city"] },
  { title: "FacultyOps", keys: ["contribution", "hod_interaction", "contribution_region", "payroll_entity", "access_status", "remarks", "exit_date"] },
];
const EMPTY_ADD = { employeeId: "", name: "", email: "", campus: "", uid: "", status: "ONBOARDING", managerId: "", values: {} as Record<string, string> };

function AddInstructorDrawer({ managers, columns, onClose, onDone }: { managers: { id: string; name: string }[]; columns: Column[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<typeof EMPTY_ADD>({ ...EMPTY_ADD, values: {} });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const colByKey = new Map(columns.map((c) => [c.key, c]));
  const get = (k: string) => (ADD_CORE.has(k) ? (f as any)[k] : (f.values[k] || ""));
  const put = (k: string, v: string) => setF((p) => (ADD_CORE.has(k) ? { ...p, [k]: v } : { ...p, values: { ...p.values, [k]: v } }));

  async function save() {
    if (!f.employeeId.trim() || !f.name.trim()) { setErr("Employee ID and Name are required."); return; }
    setBusy(true); setErr(null);
    try {
      await api.post("/instructors", { employeeId: f.employeeId, name: f.name, email: f.email, campus: f.campus, uid: f.uid, status: f.status, managerId: f.managerId || null, values: f.values });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const renderField = (key: string) => {
    const col = colByKey.get(key);
    const label = col?.label || key;
    const req = ADD_REQUIRED.has(key);
    const val = get(key);
    return (
      <div key={key}>
        <label className="label">{label}{req && <span className="text-rose-500"> *</span>}</label>
        {col?.type === "DROPDOWN" ? (
          <ScrollSelect value={val} onChange={(v) => put(key, v)} placeholder="— select —" options={[{ value: "", label: "— select —" }, ...(col.options || []).map((o) => ({ value: o, label: o }))]} />
        ) : ADD_TEXTAREA.has(key) ? (
          <textarea className="input min-h-[64px]" value={val} onChange={(e) => put(key, e.target.value)} />
        ) : col?.type === "DATE" ? (
          <input className="input" placeholder="YYYY-MM-DD" value={val} onChange={(e) => put(key, e.target.value)} />
        ) : (
          <input className="input" value={val} onChange={(e) => put(key, e.target.value)} />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-brand-600" /> Add instructor</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
          {ADD_SECTIONS.map((sec) => (
            <div key={sec.title}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{sec.title}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {sec.keys.map(renderField)}
                {sec.title === "Identity" && (
                  <>
                    <div><label className="label">Capability Manager</label>
                      <ScrollSelect value={f.managerId} placeholder="— Unassigned —" onChange={(v) => setF((p) => ({ ...p, managerId: v }))}
                        options={[{ value: "", label: "— Unassigned —" }, ...(managers || []).map((c) => ({ value: c.id, label: c.name }))]} />
                    </div>
                    <div><label className="label">Status</label>
                      <select className="input" value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))}>{Object.entries(LIFECYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <div className="flex gap-2">
            <button onClick={() => setF({ ...EMPTY_ADD, values: {} })} className="btn btn-ghost btn-sm border border-slate-200">Clear</button>
            <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Create"}</button>
          </div>
        </div>
      </div>
    </div>
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

// Identity / contact columns are per-person and never make sense to set in bulk (kept in sync with the
// server's BULK_DENY). Everything else editable (Work Location, Contribution, Department, Capability
// Manager, Payroll, Role, …) can be applied to all selected instructors at once.
const BULK_DENY = new Set(["employeeId", "name", "email", "uid", "phone", "university_mail"]);

// Bulk-edit common fields across all selected instructors (POST /master/bulk).
// Only the fields the user ticks are sent — the rest are left untouched on every instructor.
function BulkEditModal({ ids, columns, managers, onClose, onDone }: { ids: string[]; columns: Column[]; managers: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const editable = useMemo(() => columns.filter((c) => c.editable && !BULK_DENY.has(c.key)), [columns]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) => setEnabled((p) => ({ ...p, [k]: !p[k] }));
  const setVal = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const chosen = editable.filter((c) => enabled[c.key]);

  async function apply() {
    const changes = chosen.map((c) => ({ key: c.key, value: values[c.key] ?? "" }));
    if (!changes.length) { setErr("Pick at least one field to update."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.post("/master/bulk", { ids, changes });
      toast.success(`Updated ${r.fields} field(s) on ${r.updated} instructor(s)${r.failed ? `, ${r.failed} failed` : ""}.`);
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Bulk edit ${ids.length} instructor(s)`} onClose={onClose} wide>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <p className="text-sm text-slate-500">Tick the common fields to change and set a new value. Each ticked field is applied to <b>all {ids.length}</b> selected instructor(s); identity fields (Name, Employee ID, Mail, Phone) aren't bulk-editable. A blank value clears that field.</p>
        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
          {editable.map((c) => {
            const on = !!enabled[c.key];
            return (
              <div key={c.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${on ? "border-brand-300 bg-brand-50/40" : "border-slate-200"}`}>
                <label className="flex w-52 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={on} onChange={() => toggle(c.key)} className="h-4 w-4 cursor-pointer rounded border-slate-300" />
                  {c.label}
                </label>
                <div className="flex-1">
                  {on ? <BulkValueInput col={c} managers={managers} value={values[c.key] ?? ""} onChange={(v) => setVal(c.key, v)} /> : <span className="text-xs text-slate-400">— unchanged —</span>}
                </div>
              </div>
            );
          })}
          {!editable.length && <p className="text-sm text-slate-400">No bulk-editable fields are configured.</p>}
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-500">{chosen.length} field(s) selected</span>
          <div className="flex gap-2"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy || !chosen.length} onClick={apply} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Applying…" : `Apply to ${ids.length}`}</button></div>
        </div>
      </div>
    </Modal>
  );
}

// Type-aware value input for one bulk field (manager picker / dropdown / date / number / text).
function BulkValueInput({ col, managers, value, onChange }: { col: Column; managers: { id: string; name: string }[]; value: string; onChange: (v: string) => void }) {
  if (col.source === "manager") {
    return <ScrollSelect value={value} placeholder="— Unassigned —" onChange={onChange}
      options={[{ value: "", label: "— Unassigned —" }, ...managers.map((m) => ({ value: m.id, label: m.name }))]} />;
  }
  if (col.type === "DROPDOWN") {
    const opts = col.options || [];
    return <ScrollSelect value={value} placeholder="— select —" onChange={onChange}
      options={[{ value: "", label: "— select —" }, ...opts.map((o) => ({ value: o, label: o }))]} />;
  }
  return <input className="input h-9 text-sm" type={col.type === "NUMBER" ? "number" : col.type === "DATE" ? "date" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder="New value…" />;
}
