import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Papa from "papaparse";
import { Search, GraduationCap, SlidersHorizontal, X, Download } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import { useCachedGet } from "../hooks";
import Loading from "../components/Loading";
import Pagination from "../components/Pagination";
import { STATUS_OPTIONS, TONE, SHORT, statusTone } from "../training";
import { computeSummary, summaryCell, COMPUTED_KEYS } from "../trainingScore";

const COMPUTED = new Set<string>(COMPUTED_KEYS as readonly string[]);

// Each track is its own URL so only that track's rows are fetched (smaller payload, faster load).
export const TRACK_SLUG: Record<string, string> = { tech: "tech-stats", math_aptitude: "mathematics-aptitude-stats", english: "english-stats" };
const SLUG_TRACK: Record<string, string> = { "tech-stats": "tech", "mathematics-aptitude-stats": "math_aptitude", "english-stats": "english" };
const EMPTY_FILTERS = { department: "", primary_track: "", secondary_track: "", ongoing_track: "", startFrom: "", startTo: "", deadlineFrom: "", deadlineTo: "", primaryMin: "", primaryMax: "", secondaryMin: "", secondaryMax: "" };

const ID_W = 116, NAME_W = 200;

function cellValue(row: any, col: any) { return (col.storage === "module" ? row.moduleStatus?.[col.key] : row.values?.[col.key]) ?? ""; }

// One grid row, memoised so editing a cell only re-renders THIS row (keeps the dropdown instant).
const TrainingRow = memo(function TrainingRow({ r, cols, editingColKey, onEdit, onSave, onCancel, editRef }: {
  r: any; cols: any[]; editingColKey: string | null;
  onEdit: (id: string, colKey: string) => void;
  onSave: (row: any, col: any, value: string) => void;
  onCancel: () => void;
  editRef: React.MutableRefObject<HTMLSelectElement | HTMLInputElement | null>;
}) {
  // Recomputed only when this row re-renders → %, Health, Predicted stay live.
  const summary = computeSummary(r.values, r.moduleStatus, r.tab);
  return (
    <tr className="group">
      <td className="sticky z-20 border-b border-slate-100 bg-white px-3 py-3 font-mono text-[11px] text-slate-600" style={{ left: 0, width: ID_W, minWidth: ID_W }}>{r.employeeId}</td>
      <td className="sticky z-20 whitespace-nowrap border-b border-slate-100 bg-white px-3 py-3 font-medium text-slate-800" style={{ left: ID_W, minWidth: NAME_W }}>{r.name}</td>
      {cols.map((col) => {
        if (COMPUTED.has(col.key)) {
          const { text, tone: ctone } = summaryCell(col.key, summary);
          return (
            <td key={col.id} className="border-b border-l border-slate-100 p-0 text-center">
              <div className={`block w-full whitespace-nowrap px-2 py-3 text-[11px] ${ctone ? TONE[ctone] : "text-slate-600"}`} title="Calculated automatically">{text}</div>
            </td>
          );
        }
        const val = cellValue(r, col);
        const isEditing = editingColKey === col.key;
        const isStatus = col.type === "STATUS";
        const tone = isStatus ? statusTone(val) : "other";
        const baseOpts: string[] = col.options?.length ? col.options : (isStatus ? STATUS_OPTIONS : []);
        // Always surface the current value first (even legacy values not in the option list) so it displays correctly.
        const ordered = val ? [val, ...baseOpts.filter((o) => o !== val)] : baseOpts;
        return (
          <td key={col.id} className={`border-b border-l border-slate-100 p-0 ${isStatus ? "text-center" : ""}`}>
            {isEditing ? (
              col.type === "STATUS" || col.type === "DROPDOWN" ? (
                <select ref={editRef as any} autoFocus defaultValue={val || ""} onBlur={onCancel} onChange={(e) => onSave(r, col, e.target.value)} className="w-full bg-white px-1 py-3 text-xs outline-none ring-2 ring-brand-400">
                  {ordered.map((s: string) => <option key={s} value={s}>{s}</option>)}
                  <option value="">— clear —</option>
                </select>
              ) : (
                <input ref={editRef as any} autoFocus aria-label={col.label} type={col.type === "NUMBER" ? "number" : col.type === "DATE" ? "date" : "text"} defaultValue={val} onBlur={(e) => onSave(r, col, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }} className="w-full bg-white px-2 py-3 text-xs outline-none ring-2 ring-brand-400" />
              )
            ) : isStatus ? (
              <button onClick={() => onEdit(r.id, col.key)} className={`block w-full whitespace-nowrap px-2 py-3 text-[11px] ${TONE[tone]} hover:opacity-80`}>{SHORT[tone] || val || "—"}</button>
            ) : (
              <button onClick={() => onEdit(r.id, col.key)} className="block w-full whitespace-nowrap px-3 py-3 text-left text-[11px] text-slate-600 hover:bg-slate-50">{val || "—"}</button>
            )}
          </td>
        );
      })}
    </tr>
  );
});

export default function TrainingPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { slug } = useParams();
  const tabKey = SLUG_TRACK[slug || ""] || "tech";
  // Per-track fetch (cached): only this track's rows load → faster initial load, instant tab revisits.
  const { data: resp, setData: setResp, loading, error: err } = useCachedGet<any>(`/training?track=${tabKey}`);
  const [q, setQ] = useState("");
  const [cmFilter, setCmFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [edit, setEdit] = useState<any>(null); // { id, colKey }
  const editRef = useRef<HTMLSelectElement | HTMLInputElement | null>(null);
  // The header is two rows; the 2nd row must stick just below the 1st. Measure the 1st row's height.
  const headRow1Ref = useRef<HTMLTableRowElement | null>(null);
  const [headRow1H, setHeadRow1H] = useState(34);

  const data: any[] = resp?.rows || [];
  const columns: Record<string, any[]> = resp?.columns || {};
  const tracks: any[] = resp?.tracks || [];

  // Reset view state when the track (route) changes.
  useEffect(() => { setPage(0); setEdit(null); setFilters(EMPTY_FILTERS); setCmFilter(""); }, [tabKey]);

  // When a cell enters edit mode, open its native dropdown/picker immediately (single click).
  useEffect(() => {
    if (!edit || !editRef.current) return;
    const el = editRef.current as any;
    try { el.showPicker?.(); } catch { /* not supported — autoFocus still applies */ }
  }, [edit]);

  // Keep the 2nd header row pinned exactly below the 1st (height varies with content/zoom).
  useLayoutEffect(() => {
    const measure = () => { if (headRow1Ref.current) setHeadRow1H(headRow1Ref.current.offsetHeight); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tabKey, columns, loading]);

  const cols: any[] = columns[tabKey] || [];
  // Distinct Capability Managers (for the top filter) + per-track column option sets (for the drawer).
  const managers = useMemo(() => [...new Set(data.map((r: any) => r.manager).filter((m: string) => m && m !== "—"))].sort(), [data]);
  const colOptions = (key: string) => ((columns[tabKey] || []).find((c: any) => c.key === key)?.options as string[]) || [];
  const activeFilterCount = Object.values(filters).filter(Boolean).length + (cmFilter ? 1 : 0);
  const setF = (k: string, v: string) => { setFilters((p) => ({ ...p, [k]: v })); setPage(0); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setCmFilter(""); setPage(0); };
  const goTrack = (key: string) => navigate(`/app/training/${TRACK_SLUG[key] || key}`);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = filters;
    const numOr = (v: string) => { const n = Number(v); return v === "" || isNaN(n) ? null : n; };
    const pMin = numOr(f.primaryMin), pMax = numOr(f.primaryMax), sMin = numOr(f.secondaryMin), sMax = numOr(f.secondaryMax);
    const sFrom = f.startFrom ? Date.parse(f.startFrom) : null, sTo = f.startTo ? Date.parse(f.startTo) : null;
    const dFrom = f.deadlineFrom ? Date.parse(f.deadlineFrom) : null, dTo = f.deadlineTo ? Date.parse(f.deadlineTo) : null;
    const eq = (a: any, b: string) => !b || String(a || "").toLowerCase() === b.toLowerCase();
    return data.filter((r: any) => {
      if (r.tab !== tabKey) return false;
      if (needle && !(r.name.toLowerCase().includes(needle) || (r.employeeId || "").toLowerCase().includes(needle))) return false;
      if (cmFilter && r.manager !== cmFilter) return false;
      const v = r.values || {};
      if (!eq(v.department, f.department) || !eq(v.primary_track, f.primary_track) || !eq(v.secondary_track, f.secondary_track) || !eq(v.ongoing_track, f.ongoing_track)) return false;
      if (sFrom || sTo) { const t = v.ongoing_start ? Date.parse(v.ongoing_start) : NaN; if (isNaN(t) || (sFrom && t < sFrom) || (sTo && t > sTo)) return false; }
      if (dFrom || dTo) { const t = v.track_deadline ? Date.parse(v.track_deadline) : NaN; if (isNaN(t) || (dFrom && t < dFrom) || (dTo && t > dTo)) return false; }
      if (pMin != null || pMax != null || sMin != null || sMax != null) {
        const sum = computeSummary(v, r.moduleStatus || {}, r.tab);
        const pp = sum.primaryPct == null ? null : Math.round(sum.primaryPct * 100);
        const sp = sum.secondaryPct == null ? null : Math.round(sum.secondaryPct * 100);
        if (pMin != null && (pp == null || pp < pMin)) return false;
        if (pMax != null && (pp == null || pp > pMax)) return false;
        if (sMin != null && (sp == null || sp < sMin)) return false;
        if (sMax != null && (sp == null || sp > sMax)) return false;
      }
      return true;
    });
  }, [data, tabKey, q, cmFilter, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const onEdit = useCallback((id: string, colKey: string) => setEdit({ id, colKey }), []);
  const onCancel = useCallback(() => setEdit(null), []);
  const onSave = useCallback(async (row: any, col: any, value: string) => {
    const prev = cellValue(row, col);
    if (String(prev) === String(value)) { setEdit(null); return; }
    const apply = (rows: any[], v: string) => rows.map((r) => r.id !== row.id ? r : col.storage === "module"
      ? { ...r, moduleStatus: { ...r.moduleStatus, [col.key]: v || undefined } }
      : { ...r, values: { ...r.values, [col.key]: v } });
    setResp((d: any) => d ? { ...d, rows: apply(d.rows, value) } : d);
    setEdit(null);
    try { await api.post("/training", { instructorId: row.id, track: row.tab, target: col.storage, key: col.key, value }); }
    catch {
      toast.error("Save failed — reverted");
      setResp((d: any) => d ? { ...d, rows: apply(d.rows, prev) } : d);
    }
  }, [setResp, toast]);

  // Group consecutive columns sharing the same `group` for the two-row header.
  const segs = useMemo(() => {
    const out: { group: string; cols: any[] }[] = [];
    for (const c of cols) { const last = out[out.length - 1]; if (last && last.group === (c.group || "")) last.cols.push(c); else out.push({ group: c.group || "", cols: [c] }); }
    return out;
  }, [cols]);

  // Export the CURRENT (filtered) table for this track as CSV — columns mirror what's on screen.
  function exportCsv() {
    const header = ["Employee ID", "Name", ...cols.map((c: any) => c.label)];
    const out = filtered.map((r: any) => {
      const sum = computeSummary(r.values, r.moduleStatus || {}, r.tab);
      return [r.employeeId, r.name, ...cols.map((c: any) => (COMPUTED.has(c.key) ? summaryCell(c.key, sum).text : (cellValue(r, c) || "")))];
    });
    const csv = Papa.unparse([header, ...out]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `training-${tabKey}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  if (!resp && loading) return <Loading />;
  if (err && !resp) return <div className="card p-6 text-sm text-rose-600">{err}</div>;

  const head = "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600";
  const frozenHead = "sticky top-0 z-30 border-b border-slate-200 bg-slate-50 text-slate-600";
  const grouped = segs.filter((s) => s.group);

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800"><GraduationCap className="h-6 w-6 text-brand-600" /> Instructors Training Stats</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name or ID…" className="input w-56 pl-9" />
          </div>
          <select value={cmFilter} onChange={(e) => { setCmFilter(e.target.value); setPage(0); }} title="Capability Manager" className="input w-48">
            <option value="">All managers</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={exportCsv} className="btn btn-ghost btn-sm" title="Export the current table as CSV"><Download className="h-4 w-4" /> Export CSV</button>
          {activeFilterCount > 0 && <button onClick={clearFilters} className="btn btn-ghost btn-sm text-rose-600 hover:text-rose-700">Clear all ({activeFilterCount})</button>}
          <button onClick={() => setFilterOpen(true)} className="btn btn-ghost btn-sm">
            <SlidersHorizontal className="h-4 w-4" /> Filter
            {activeFilterCount > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tracks.map((t) => (
            <button key={t.key} onClick={() => goTrack(t.key)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tabKey === t.key ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {[["completed", "Completed"], ["progress", "In Progress"], ["hold", "On Hold"], ["notstarted", "Not Started"]].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5"><span className={`inline-block h-3 w-3 rounded ${TONE[k]}`} /> {l}</span>
          ))}
        </div>
      </div>

      <div className="card min-h-0 flex-1 overflow-auto p-0">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr ref={headRow1Ref}>
              <th rowSpan={2} className={`${frozenHead} px-3 py-2 text-left font-semibold`} style={{ left: 0, width: ID_W, minWidth: ID_W }}>Employee ID</th>
              <th rowSpan={2} className={`${frozenHead} whitespace-nowrap px-3 py-2 text-left font-semibold`} style={{ left: ID_W, minWidth: NAME_W }}>Name</th>
              {segs.map((s, i) => s.group
                ? <th key={i} colSpan={s.cols.length} className={`${head} border-l border-slate-200 px-3 py-2 text-center font-semibold`}>{s.group}</th>
                : s.cols.map((c) => <th key={c.id} rowSpan={2} className={`${head} border-l border-slate-200 px-3 py-2 text-left font-semibold`} style={{ minWidth: 120 }}>{c.label}</th>)
              )}
            </tr>
            <tr>
              {grouped.flatMap((s) => s.cols).map((c) => <th key={c.id} className={`${head} whitespace-nowrap px-2 py-2 text-center font-medium`} style={{ minWidth: 110, top: headRow1H }}><div className="leading-tight">{c.label}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <TrainingRow key={r.id} r={r} cols={cols}
                editingColKey={edit && edit.id === r.id ? edit.colKey : null}
                onEdit={onEdit} onSave={onSave} onCancel={onCancel} editRef={editRef} />
            ))}
            {!shown.length && <tr><td colSpan={2 + cols.length} className="px-5 py-8 text-center text-slate-400">No instructors in this track.</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination page={safePage + 1} pages={pageCount} per={pageSize} total={filtered.length} onPage={(p) => setPage(p - 1)} onPer={(n) => { setPageSize(n); setPage(0); }} />

      {/* Right-side filter drawer — full height, scrollable, with Apply / Clear at the bottom. */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onMouseDown={() => setFilterOpen(false)}>
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800"><SlidersHorizontal className="h-5 w-5 text-brand-600" /> Filters</h2>
              <button onClick={() => setFilterOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <label className="label">Track</label>
                <select value={tabKey} onChange={(e) => { goTrack(e.target.value); setFilterOpen(false); }} className="input w-full">
                  {tracks.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.count})</option>)}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">Track-specific options below update with this selection.</p>
              </div>

              <FilterSelect label="Department" value={filters.department} options={colOptions("department")} onChange={(v) => setF("department", v)} />
              <FilterSelect label="Primary Track" value={filters.primary_track} options={colOptions("primary_track")} onChange={(v) => setF("primary_track", v)} />
              <FilterSelect label="Secondary Track" value={filters.secondary_track} options={colOptions("secondary_track")} onChange={(v) => setF("secondary_track", v)} />
              <FilterSelect label="Ongoing Track" value={filters.ongoing_track} options={colOptions("ongoing_track")} onChange={(v) => setF("ongoing_track", v)} />

              <div>
                <label className="label">Ongoing Track Start (range)</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={filters.startFrom} onChange={(e) => setF("startFrom", e.target.value)} className="input w-full" />
                  <span className="text-xs text-slate-400">to</span>
                  <input type="date" value={filters.startTo} onChange={(e) => setF("startTo", e.target.value)} className="input w-full" />
                </div>
              </div>
              <div>
                <label className="label">Ongoing Track Deadline (range)</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={filters.deadlineFrom} onChange={(e) => setF("deadlineFrom", e.target.value)} className="input w-full" />
                  <span className="text-xs text-slate-400">to</span>
                  <input type="date" value={filters.deadlineTo} onChange={(e) => setF("deadlineTo", e.target.value)} className="input w-full" />
                </div>
              </div>
              <div>
                <label className="label">Primary Score % (range)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} placeholder="min" value={filters.primaryMin} onChange={(e) => setF("primaryMin", e.target.value)} className="input w-full" />
                  <span className="text-xs text-slate-400">to</span>
                  <input type="number" min={0} max={100} placeholder="max" value={filters.primaryMax} onChange={(e) => setF("primaryMax", e.target.value)} className="input w-full" />
                </div>
              </div>
              <div>
                <label className="label">Secondary Score % (range)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} placeholder="min" value={filters.secondaryMin} onChange={(e) => setF("secondaryMin", e.target.value)} className="input w-full" />
                  <span className="text-xs text-slate-400">to</span>
                  <input type="number" min={0} max={100} placeholder="max" value={filters.secondaryMax} onChange={(e) => setF("secondaryMax", e.target.value)} className="input w-full" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
              <button onClick={clearFilters} className="btn btn-ghost btn-sm flex-1">Clear all</button>
              <button onClick={() => setFilterOpen(false)} className="btn btn-primary btn-sm flex-1">Apply ({filtered.length})</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-full">
        <option value="">Any</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
