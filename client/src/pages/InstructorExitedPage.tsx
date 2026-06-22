import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, SlidersHorizontal, Download, X } from "lucide-react";
import { api, API_BASE } from "../api";
import { useAuth } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import { useToast } from "../toast";
import Pagination from "../components/Pagination";
import ScrollSelect from "../components/ScrollSelect";

// Exited instructors only — a dedicated, inline-editable grid with the full EXIT-sheet columns.
type Save = { kind: "core" | "value" | "manager" | "exit"; key?: string };
type Col = { label: string; field: string; save: Save; manager?: boolean; dropdown?: string[]; wrap?: boolean };
type Filters = { department: string; managerId: string; campus: string; region: string; payroll: string; typeOfExit: string; exitPreset: string; exitFrom: string; exitTo: string };
const EMPTY: Filters = { department: "", managerId: "", campus: "", region: "", payroll: "", typeOfExit: "", exitPreset: "", exitFrom: "", exitTo: "" };
type Facets = { departments: string[]; campuses: string[]; regions: string[]; payrolls: string[]; types: string[] };
const EMPTY_FACETS: Facets = { departments: [], campuses: [], regions: [], payrolls: [], types: [] };
const EXIT_PRESETS = [
  { value: "last_month", label: "Last month (30 days)" },
  { value: "past_3_months", label: "Past 3 months" },
  { value: "past_6_months", label: "Past 6 months" },
  { value: "past_year", label: "Past year" },
];
const EXIT_TYPES = ["Formal exit - Resignation", "Formal exit - Termination", "Absconding", "End of Contract", "Higher Studies", "Other"];

// EXIT-sheet columns in order. Employee ID is the locked first column (not in this list).
const COLS: Col[] = [
  { label: "Name", field: "name", save: { kind: "core", key: "name" } },
  { label: "Department", field: "department", save: { kind: "value", key: "department" } },
  { label: "Capability Manager", field: "managerName", save: { kind: "manager" }, manager: true },
  { label: "Work Location", field: "campus", save: { kind: "core", key: "campus" } },
  { label: "Contribution", field: "contribution", save: { kind: "value", key: "contribution" } },
  { label: "Contribution Region", field: "contributionRegion", save: { kind: "value", key: "contribution_region" } },
  { label: "Reporting Manager (Darwin)", field: "reportingManager", save: { kind: "value", key: "reporting_manager" } },
  { label: "Payroll", field: "payroll", save: { kind: "value", key: "payroll_entity" } },
  { label: "Role", field: "designation", save: { kind: "value", key: "designation" } },
  { label: "Phone Number", field: "phone", save: { kind: "value", key: "phone" } },
  { label: "Mail ID", field: "email", save: { kind: "core", key: "email" } },
  { label: "University Mail Id", field: "universityMail", save: { kind: "value", key: "university_mail" } },
  { label: "DOJ", field: "doj", save: { kind: "value", key: "doj" } },
  { label: "Qualification", field: "qualification", save: { kind: "value", key: "qualification" } },
  { label: "Domain", field: "domain", save: { kind: "value", key: "domain" } },
  { label: "UID", field: "uid", save: { kind: "core", key: "uid" } },
  { label: "Gender", field: "gender", save: { kind: "value", key: "gender" }, dropdown: ["Male", "Female"] },
  { label: "Native language", field: "nativeLanguage", save: { kind: "value", key: "native_language" } },
  { label: "Portal / Assets / Drive Access", field: "access", save: { kind: "value", key: "access_status" } },
  { label: "Capability Manager Employee ID", field: "cmEmployeeId", save: { kind: "value", key: "cm_employee_id" } },
  { label: "Exit Date", field: "exitDate", save: { kind: "exit", key: "lastWorkingDay" } },
  { label: "Remarks", field: "remarks", save: { kind: "value", key: "remarks" }, wrap: true },
  { label: "Type Of Exit", field: "typeOfExit", save: { kind: "exit", key: "typeOfExit" }, dropdown: EXIT_TYPES },
  { label: "Reason For Exit", field: "exitReason", save: { kind: "exit", key: "reason" }, wrap: true },
  { label: "Indetailed Reason", field: "exitDetailedReason", save: { kind: "exit", key: "detailedReason" }, wrap: true },
];

export default function InstructorExitedPage() {
  const { user } = useAuth();
  const canEdit = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER";
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [cms, setCms] = useState<any[]>([]);
  const [edit, setEdit] = useState<{ id: string; field: string } | null>(null);

  useEffect(() => {
    api.get("/mapping").then((r) => setCms(r.cms)).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (applied.department) p.set("department", applied.department);
    if (applied.managerId) p.set("managerId", applied.managerId);
    if (applied.campus) p.set("campus", applied.campus);
    if (applied.region) p.set("region", applied.region);
    if (applied.payroll) p.set("payroll", applied.payroll);
    if (applied.typeOfExit) p.set("typeOfExit", applied.typeOfExit);
    if (applied.exitPreset) p.set("exitPreset", applied.exitPreset);
    if (applied.exitFrom) p.set("exitFrom", applied.exitFrom);
    if (applied.exitTo) p.set("exitTo", applied.exitTo);
    return p;
  }, [dq, applied]);

  useEffect(() => {
    const ac = new AbortController();
    const p = new URLSearchParams(query); p.set("page", String(page)); p.set("per", String(per));
    api.get(`/instructors/exited?${p}`, { signal: ac.signal })
      .then((r) => { setRows(r.instructors); setTotal(r.total); if (r.facets) setFacets(r.facets); setErr(null); if (page > r.pages && r.pages >= 1) setPage(r.pages); })
      .catch((e) => { if (!isAbort(e)) setErr(e.message || "Failed to load exited instructors"); });
    return () => ac.abort();
  }, [query, page, per]);

  // CSV export mirrors the DB-level filters (exit-date range isn't applied to the CSV).
  const exportHref = () => {
    const p = new URLSearchParams({ scope: "exited" });
    if (dq) p.set("q", dq);
    for (const k of ["department", "managerId", "campus", "region", "payroll", "typeOfExit"] as const) if (applied[k]) p.set(k, applied[k]);
    return `${API_BASE}/api/instructors/export.csv?${p}`;
  };

  const cmName = useMemo(() => Object.fromEntries(cms.map((c) => [c.id, c.name])), [cms]);
  const activeCount = Object.values(applied).filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(total / per));
  function openDrawer() { setDraft(applied); setDrawer(true); }
  function applyFilters() { setApplied(draft); setPage(1); setDrawer(false); }
  function clearAll() { setApplied(EMPTY); setDraft(EMPTY); setPage(1); }

  async function save(row: any, col: Col, raw: string) {
    setEdit(null);
    const cur = col.manager ? (row.managerId || "") : (row[col.field] ?? "");
    if (String(cur) === String(raw)) return;
    const prev = { ...row };
    setRows((rs) => rs.map((r) => {
      if (r.id !== row.id) return r;
      return col.manager ? { ...r, managerId: raw, managerName: raw ? cmName[raw] || "" : "" } : { ...r, [col.field]: raw };
    }));
    try {
      await api.post(`/instructors/${row.id}/cell`, { kind: col.save.kind, key: col.save.key, value: raw });
    } catch (e: any) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? prev : r)));
      toast.error(e.message || "Failed to save");
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instructor Exited</h1>
          <p className="text-sm text-slate-500">Instructors who have exited NIAT{canEdit ? " — click any cell to edit." : "."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9 text-sm" placeholder="Name, ID, email…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <button onClick={openDrawer} className="btn btn-ghost btn-sm shrink-0">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>}
          </button>
          {activeCount > 0 && <button onClick={clearAll} className="text-sm font-medium text-slate-500 hover:text-rose-600">Clear filters</button>}
          <a href={exportHref()} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</a>
        </div>
      </div>

      {err && <div className="card p-4 text-sm text-rose-600">{err}</div>}

      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{total} exited instructor(s)</div>
        <div className="flex-1 overflow-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="sticky left-0 top-0 z-30 bg-slate-50 px-3 py-3 font-semibold">Employee ID</th>
                {COLS.map((c) => <th key={c.field} className="sticky top-0 z-20 bg-slate-50 px-3 py-3 font-semibold">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="group hover:bg-slate-50">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-mono text-xs text-slate-500 group-hover:bg-slate-50" style={{ minWidth: 120 }}>
                    <Link to={`/app/instructors/${row.id}`} className="hover:text-brand-700 hover:underline">{row.employeeId}</Link>
                  </td>
                  {COLS.map((c) => {
                    const val = row[c.field] ?? "";
                    const display = val === "" || val == null ? "—" : val;
                    const isEditing = canEdit && edit?.id === row.id && edit?.field === c.field;
                    return (
                      <td key={c.field} className="px-3 py-2" style={{ minWidth: c.wrap ? 200 : 150, maxWidth: c.wrap ? 360 : 260 }}>
                        {isEditing ? (
                          <CellEditor col={c} cms={cms} value={c.manager ? (row.managerId || "") : String(val)} onCommit={(v) => save(row, c, v)} onCancel={() => setEdit(null)} />
                        ) : (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => canEdit && setEdit({ id: row.id, field: c.field })}
                            className={`block w-full truncate rounded px-2 py-1 text-left ${canEdit ? "cursor-text hover:bg-brand-50" : "cursor-default"} ${display === "—" ? "text-slate-300" : "text-slate-600"}`}
                            title={typeof display === "string" ? display : ""}
                          >
                            {display}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={COLS.length + 1} className="px-5 py-10 text-center text-slate-400">No exited instructors match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pages={pages} per={per} total={total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />

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
              <div><label className="label">Department</label>
                <ScrollSelect value={draft.department} onChange={(v) => setDraft({ ...draft, department: v })} placeholder="All departments"
                  options={[{ value: "", label: "All departments" }, ...facets.departments.map((d) => ({ value: d, label: d }))]} />
              </div>
              <div><label className="label">Capability Manager</label>
                <ScrollSelect value={draft.managerId} onChange={(v) => setDraft({ ...draft, managerId: v })} placeholder="All managers"
                  options={[{ value: "", label: "All managers" }, ...cms.map((c) => ({ value: c.id, label: c.name }))]} />
              </div>
              <div><label className="label">Type of Exit</label>
                <ScrollSelect value={draft.typeOfExit} onChange={(v) => setDraft({ ...draft, typeOfExit: v })} placeholder="All types"
                  options={[{ value: "", label: "All types" }, ...facets.types.map((t) => ({ value: t, label: t }))]} />
              </div>
              <div><label className="label">Contribution Region</label>
                <ScrollSelect value={draft.region} onChange={(v) => setDraft({ ...draft, region: v })} placeholder="All regions"
                  options={[{ value: "", label: "All regions" }, ...facets.regions.map((r) => ({ value: r, label: r }))]} />
              </div>
              <div><label className="label">Payroll</label>
                <ScrollSelect value={draft.payroll} onChange={(v) => setDraft({ ...draft, payroll: v })} placeholder="All"
                  options={[{ value: "", label: "All" }, ...facets.payrolls.map((p) => ({ value: p, label: p }))]} />
              </div>
              <div><label className="label">Work Location</label>
                <ScrollSelect value={draft.campus} onChange={(v) => setDraft({ ...draft, campus: v })} placeholder="All locations"
                  options={[{ value: "", label: "All locations" }, ...facets.campuses.map((c) => ({ value: c, label: c }))]} />
              </div>
              <div className="border-t border-slate-100 pt-4">
                <label className="label">Exit date — quick range</label>
                <ScrollSelect value={draft.exitPreset} onChange={(v) => setDraft({ ...draft, exitPreset: v, exitFrom: "", exitTo: "" })} placeholder="Any time"
                  options={[{ value: "", label: "Any time" }, ...EXIT_PRESETS]} />
                <p className="mt-3 mb-1 text-xs text-slate-400">…or a custom range (overrides quick range)</p>
                <div className="flex items-center gap-2">
                  <input type="date" className="input" value={draft.exitFrom} onChange={(e) => setDraft({ ...draft, exitFrom: e.target.value, exitPreset: "" })} />
                  <span className="text-slate-400">→</span>
                  <input type="date" className="input" value={draft.exitTo} onChange={(e) => setDraft({ ...draft, exitTo: e.target.value, exitPreset: "" })} />
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

// Type-aware inline editor: manager picker / dropdown / text.
function CellEditor({ col, cms, value, onCommit, onCancel }: { col: Col; cms: any[]; value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const base = "w-full min-w-[150px] rounded border border-brand-400 px-2 py-1 text-sm outline-none ring-2 ring-brand-100";
  if (col.manager) {
    const options = [{ value: "", label: "— unassigned —" }, ...cms.map((c) => ({ value: c.id, label: c.name }))];
    return <ScrollSelect autoOpen value={value} options={options} placeholder="— unassigned —" onChange={onCommit} onClose={onCancel} className={`${base} flex items-center justify-between gap-2`} />;
  }
  if (col.dropdown) {
    const extra = value && !col.dropdown.includes(value) ? [{ value, label: value }] : [];
    const options = [{ value: "", label: "— select —" }, ...extra, ...col.dropdown.map((o) => ({ value: o, label: o }))];
    return <ScrollSelect autoOpen value={value} options={options} onChange={onCommit} onClose={onCancel} className={`${base} flex items-center justify-between gap-2`} />;
  }
  return (
    <input autoFocus type="text" defaultValue={value} className={base}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }} />
  );
}
