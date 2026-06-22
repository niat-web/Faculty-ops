import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, Download, X } from "lucide-react";
import { api, API_BASE } from "../api";
import { ROLE_LABEL } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import { useToast } from "../toast";
import Pagination from "../components/Pagination";
import Loading from "../components/Loading";
import ScrollSelect from "../components/ScrollSelect";

type Column = { key: string; label: string; source: "core" | "manager" | "value"; type: string; options?: string[]; editable: boolean };
type Meta = { columns: Column[]; managers: { id: string; name: string }[]; filters: { departments: string[]; payrolls: string[]; regions: string[]; campuses: string[] } };
type Filters = { managerId: string; department: string; payroll: string; region: string; campus: string };
const EMPTY: Filters = { managerId: "", department: "", payroll: "", region: "", campus: "" };

export default function InstructorMasterPage() {
  const toast = useToast();
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
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (role) p.set("role", role);
    if (applied.managerId) p.set("managerId", applied.managerId);
    if (applied.department) p.set("department", applied.department);
    if (applied.payroll) p.set("payroll", applied.payroll);
    if (applied.region) p.set("region", applied.region);
    if (applied.campus) p.set("campus", applied.campus);
    p.set("scope", scope);
    return p;
  }, [dq, applied, scope, role]);

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
  const activeCount = Object.values(applied).filter(Boolean).length;

  function openDrawer() { setDraft(applied); setDrawer(true); }
  function applyFilters() { setApplied(draft); setPage(1); setDrawer(false); }
  function clearAll() { setApplied(EMPTY); setDraft(EMPTY); setPage(1); }

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
                  <th key={c.key} className={`sticky top-0 bg-slate-50 px-3 py-3 font-semibold ${i === 0 ? "left-0 z-30" : i === 1 ? "left-[120px] z-30" : "z-20"}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="group hover:bg-slate-50">
                  {meta.columns.map((c, i) => {
                    const sticky = i === 0 ? "sticky left-0 z-10 bg-white group-hover:bg-slate-50" : i === 1 ? "sticky left-[120px] z-10 bg-white group-hover:bg-slate-50" : "";
                    const display = c.source === "manager" ? (row.managerName || "—") : (row[c.key] === "" || row[c.key] == null ? "—" : row[c.key]);
                    const isEditing = edit?.id === row.id && edit?.key === c.key;
                    return (
                      <td key={c.key} className={`px-3 py-2 ${sticky} ${i === 0 ? "font-medium" : ""}`} style={i === 0 ? { minWidth: 120 } : i === 1 ? { minWidth: 160 } : undefined}>
                        {isEditing ? (
                          <CellEditor col={c} managers={meta.managers} value={c.source === "manager" ? (row.managerId || "") : String(row[c.key] ?? "")} onCommit={(v) => save(row, c, v)} onCancel={() => setEdit(null)} />
                        ) : (
                          <button
                            type="button"
                            disabled={!c.editable}
                            onClick={() => c.editable && setEdit({ id: row.id, key: c.key })}
                            className={`block w-full max-w-[280px] truncate rounded px-2 py-1 text-left ${c.editable ? "cursor-text hover:bg-brand-50" : "cursor-default text-slate-500"} ${display === "—" ? "text-slate-300" : ""}`}
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
              {!rows.length && <tr><td colSpan={meta.columns.length} className="px-5 py-10 text-center text-slate-400">No instructors match these filters.</td></tr>}
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
              <DrawerSelect label="Capability Manager" value={draft.managerId} onChange={(v) => setDraft({ ...draft, managerId: v })} options={meta.managers.map((m) => ({ value: m.id, label: m.name }))} allLabel="All managers" />
              <DrawerSelect label="Department" value={draft.department} onChange={(v) => setDraft({ ...draft, department: v })} options={meta.filters.departments.map((d) => ({ value: d, label: d }))} allLabel="All departments" />
              <DrawerSelect label="Payroll" value={draft.payroll} onChange={(v) => setDraft({ ...draft, payroll: v })} options={meta.filters.payrolls.map((d) => ({ value: d, label: d }))} allLabel="All" />
              <DrawerSelect label="Contribution Region" value={draft.region} onChange={(v) => setDraft({ ...draft, region: v })} options={meta.filters.regions.map((d) => ({ value: d, label: d }))} allLabel="All regions" />
              <DrawerSelect label="Work Location" value={draft.campus} onChange={(v) => setDraft({ ...draft, campus: v })} options={meta.filters.campuses.map((d) => ({ value: d, label: d }))} allLabel="All locations" />
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

function DrawerSelect({ label, value, onChange, options, allLabel }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; allLabel: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <ScrollSelect value={value} onChange={onChange} placeholder={allLabel} options={[{ value: "", label: allLabel }, ...options]} />
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
      type={col.type === "NUMBER" ? "number" : col.type === "DATE" ? "date" : "text"}
      defaultValue={value}
      className={base}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }}
    />
  );
}
