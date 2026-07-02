import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import Papa from "papaparse";
import { Search, GraduationCap, SlidersHorizontal, X, Download, Code2, Sigma, Languages, ChevronDown, Check, Inbox } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import { useCachedGet } from "../hooks";
import Loading from "../components/Loading";
import Pagination from "../components/Pagination";
import ScrollSelect from "../components/ScrollSelect";
import { STATUS_OPTIONS, TONE, SHORT, statusTone } from "../training";
import { computeSummary, summaryCell, COMPUTED_KEYS } from "../trainingScore";

const COMPUTED = new Set<string>(COMPUTED_KEYS as readonly string[]);

// Each track is its own URL so only that track's rows are fetched (smaller payload, faster load).
export const TRACK_SLUG: Record<string, string> = { tech: "tech-stats", math_aptitude: "mathematics-aptitude-stats", english: "english-stats" };
// Per-track icon for the segmented switcher (falls back to GraduationCap).
const TRACK_ICON: Record<string, typeof Code2> = { tech: Code2, math_aptitude: Sigma, english: Languages };
const SLUG_TRACK: Record<string, string> = { "tech-stats": "tech", "mathematics-aptitude-stats": "math_aptitude", "english-stats": "english" };
const EMPTY_FILTERS = { department: "", primary_track: "", secondary_track: "", ongoing_track: "", startFrom: "", startTo: "", deadlineFrom: "", deadlineTo: "", primaryMin: "", primaryMax: "", secondaryMin: "", secondaryMax: "" };
const MANUAL_MODULE_KEYS = new Set(["Frontend Projects", "Backend Projects"]);
// Columns that accept MULTIPLE options; stored newline-joined, displayed stacked one per line.
const MULTI_KEYS = new Set(["sem1", "sem2"]);
const parseMulti = (v: string) => (v ? String(v).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean) : []);

const ID_W = 116, NAME_W = 200;

function cellValue(row: any, col: any) { return (col.storage === "module" ? row.moduleStatus?.[col.key] : row.values?.[col.key]) ?? ""; }
function statusDisplayValue(value: string, tone: string) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  if (/\(\s*\d+%+\s*\)/.test(raw)) return raw;
  if (tone === "completed") return "Completed (100%)";
  if (tone === "notstarted") return "Not Started (0%)";
  return raw || SHORT[tone] || "—";
}
function statusParts(value: string, tone: string) {
  const text = statusDisplayValue(value, tone);
  const match = text.match(/^(.*?)\s*\((\d+)%\)$/);
  if (!match) return { label: text, pct: null as number | null };
  return { label: match[1].trim(), pct: Number(match[2]) };
}
function syncedStatusText(value: string, tone: string) {
  const { label, pct } = statusParts(value, tone);
  return pct == null ? label : `${label} (${pct}%)`;
}
function isSyncedCourseColumn(col: any) { return col.storage === "module" && col.courseId && !MANUAL_MODULE_KEYS.has(col.key); }

// Read-only status → a compact, subtle chip (GitHub/Linear style): tint bg, 4px radius, tight padding.
// Small footprint so it never dominates the cell, and the row's zebra/hover still reads as one unit.
const CHIP_TONE: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  progress: "bg-amber-50 text-amber-700",
  hold: "bg-slate-100 text-slate-600",
  notstarted: "bg-rose-50 text-rose-600",
  other: "bg-slate-100 text-slate-600",
  empty: "",
};
function StatusChip({ text, tone }: { text: string; tone: string }) {
  if (!text || tone === "empty") return <span className="text-[11px] text-slate-300">—</span>;
  return <span className={`inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${CHIP_TONE[tone] || CHIP_TONE.other}`}>{text}</span>;
}

// Multi-select editor for SEM columns: tick several options; changes apply when you click away
// (no explicit confirm). Single-select columns use ScrollSelect (pick applies immediately).
function MultiSelectEditor({ value, options, onSave, onCancel }: {
  value: string; options: string[]; onSave: (v: string) => void; onCancel: () => void;
}) {
  const [sel, setSel] = useState<string[]>(parseMulti(value));
  const selRef = useRef(sel); selRef.current = sel; // read latest selection inside the click-away handler
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const place = () => {
    const el = anchorRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
    const placeAbove = below < 240 && above > below;
    const maxHeight = Math.min(320, Math.max(160, placeAbove ? above : below));
    const width = Math.max(r.width, 200);
    setPos(placeAbove
      ? { left: r.left, width, bottom: window.innerHeight - r.top + 4, maxHeight }
      : { left: r.left, width, top: r.bottom + 4, maxHeight });
  };
  useLayoutEffect(() => { place(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return; onSave(selRef.current.join("\n")); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    const reposition = (e?: Event) => { if (e && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return; place(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [onSave, onCancel]);
  const toggle = (o: string) => setSel((s) => s.includes(o) ? s.filter((x) => x !== o) : [...s, o]);
  return (
    <div ref={anchorRef} className="min-h-[36px] w-full">
      {pos && createPortal(
        <div ref={menuRef} style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="z-[60] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight - 28 }}>
            {options.map((o) => (
              <button key={o} type="button" onClick={() => toggle(o)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition hover:bg-slate-50 ${sel.includes(o) ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700"}`}>
                <span className="truncate">{o}</span>
                {sel.includes(o) && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 px-3 py-1 text-[10px] text-slate-400">Select options · click away to save</div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Health Status → clean enterprise pill (no emojis): strip any leading symbol and pick a tone by wording.
function healthMeta(text: string): { label: string; dot: string; cls: string } {
  const label = String(text || "").replace(/^[^A-Za-z0-9]+/, "").trim();
  const s = label.toLowerCase();
  if (!label || label === "—") return { label: "—", dot: "", cls: "" };
  if (s.includes("on track")) return { label, dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (s.includes("needs monitoring")) return { label, dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
  if (s.includes("at risk")) return { label, dot: "bg-rose-500", cls: "bg-rose-50 text-rose-700 ring-rose-200" };
  if (s.includes("not started")) return { label, dot: "bg-rose-400", cls: "bg-rose-50 text-rose-600 ring-rose-200" };
  if (s.includes("overdue")) return { label, dot: "bg-slate-500", cls: "bg-slate-100 text-slate-600 ring-slate-300" };
  return { label, dot: "bg-slate-400", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
}

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
    <tr className="group bg-white transition-colors even:bg-slate-50 hover:!bg-brand-50">
      <td className="sticky z-20 border-b border-slate-100 bg-inherit px-3 py-2 font-mono text-[11px] text-slate-600" style={{ left: 0, width: ID_W, minWidth: ID_W }}>{r.employeeId}</td>
      <td className="sticky z-20 whitespace-nowrap border-b border-r border-slate-200 bg-inherit px-3 py-2 font-medium text-slate-800" style={{ left: ID_W, minWidth: NAME_W }}>{r.name}</td>
      {cols.map((col) => {
        if (COMPUTED.has(col.key)) {
          const isHealth = col.key === "health_status" || col.key === "secondary_health_status";
          const { text, tone: ctone } = summaryCell(col.key, summary);
          return (
            <td key={col.id} className="border-b border-slate-100 px-1.5 text-center" title="Calculated automatically">
              <div className="flex min-h-[36px] w-full items-center justify-center whitespace-nowrap">
                {isHealth
                  ? <StatusChip text={healthMeta(text).label} tone={ctone || "other"} />
                  : <span className="text-[11px] font-semibold text-slate-700">{text}</span>}
              </div>
            </td>
          );
        }
        const val = cellValue(r, col);
        const isEditing = editingColKey === col.key;
        const isStatus = col.type === "STATUS";
        const isSynced = isStatus && isSyncedCourseColumn(col);
        const tone = isStatus ? statusTone(val) : "other";
        const baseOpts: string[] = col.options?.length ? col.options : (isStatus ? STATUS_OPTIONS : []);
        const selectLike = col.type === "STATUS" || col.type === "DROPDOWN";
        const multi = MULTI_KEYS.has(col.key);
        return (
          <td key={col.id} className="border-b border-slate-100 px-1.5 text-center">
            {isSynced ? (
              // Live BigQuery value → compact read-only chip. Transparent cell so the row bg flows through.
              <div className="flex min-h-[36px] w-full items-center justify-center whitespace-nowrap">
                <StatusChip text={syncedStatusText(val, tone)} tone={tone} />
              </div>
            ) : isEditing ? (
              selectLike ? (
                multi ? (
                  <MultiSelectEditor value={val || ""} options={baseOpts} onSave={(v) => onSave(r, col, v)} onCancel={onCancel} />
                ) : (
                  <ScrollSelect autoOpen value={val || ""} onChange={(v) => onSave(r, col, v)} onClose={onCancel} placeholder="— clear —"
                    className="w-full rounded border border-brand-400 bg-white px-1.5 py-1 text-[11px] outline-none ring-2 ring-brand-100 flex items-center justify-between gap-1"
                    options={[...baseOpts.map((s: string) => ({ value: s, label: s })), { value: "", label: "— clear —" }]} />
                )
              ) : (
                <div className="flex min-h-[36px] w-full items-center">
                  <input ref={editRef as any} autoFocus aria-label={col.label}
                    type={col.type === "NUMBER" ? "number" : col.type === "DATE" ? "date" : "text"}
                    defaultValue={col.type === "DATE" ? (val && !isNaN(Date.parse(val)) ? new Date(val).toISOString().slice(0, 10) : "") : val}
                    onBlur={(e) => onSave(r, col, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }} className="w-full rounded border border-brand-400 bg-white px-1.5 py-1 text-[11px] outline-none ring-2 ring-brand-100" />
                </div>
              )
            ) : isStatus ? (
              // Manual module (Frontend/Backend Projects) → colored status chip, clickable to edit.
              <button onClick={() => onEdit(r.id, col.key)} className="flex min-h-[36px] w-full items-center justify-center rounded transition hover:bg-black/[0.03]">
                {val ? <StatusChip text={SHORT[tone] || val} tone={tone} /> : <span className="text-[11px] text-slate-300">Select</span>}
              </button>
            ) : multi ? (
              // Multi-select (SEM 1/2) → chosen options stack vertically, one per line. Plain (no box).
              <button onClick={() => onEdit(r.id, col.key)} className="flex min-h-[36px] w-full flex-col items-center justify-center gap-0.5 rounded px-1.5 text-[11px] text-slate-600 transition hover:bg-brand-50/40">
                {parseMulti(val).length ? parseMulti(val).map((t, i) => <span key={i} className="w-full truncate text-center leading-tight">{t}</span>) : <span className="text-slate-300">Select</span>}
              </button>
            ) : (
              // All other editable value cells (Department, tracks, dates, reporting, remarks…) → plain, no box.
              <button onClick={() => onEdit(r.id, col.key)} className="flex min-h-[36px] w-full items-center justify-center rounded px-1.5 text-[11px] text-slate-600 transition hover:bg-brand-50/40">
                <span className={`truncate ${col.key === "department" ? "max-w-[150px]" : (col.key === "remarks" || col.key === "other_learnings") ? "max-w-[180px]" : ""} ${val ? "" : "text-slate-300"}`}>{val || "Select"}</span>
              </button>
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
  const syncToastRef = useRef<string>("");
  // Sticky header during PAGE scroll: the page (<main>) scrolls vertically while the table keeps
  // its own horizontal scroll. CSS sticky can't pin the header to the page through an overflow-x
  // wrapper, so we translate the <thead> down by the page's scrollTop to keep it visually pinned.
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const data: any[] = resp?.rows || [];
  const columns: Record<string, any[]> = resp?.columns || {};
  const tracks: any[] = resp?.tracks || [];
  const progressSync = resp?.progressSync;

  // Reset view state when the track (route) changes.
  useEffect(() => { setPage(0); setEdit(null); setFilters(EMPTY_FILTERS); setCmFilter(""); }, [tabKey]);

  // On load / sync, surface the BigQuery status as a long-lived toast (30s) instead of a header banner.
  useEffect(() => {
    if (!progressSync) return;
    const key = progressSync.lastSyncedAt || progressSync.error || "";
    if (!key || syncToastRef.current === key) return;
    syncToastRef.current = key;
    if (progressSync.ok) toast.success(`Live from BigQuery · ${progressSync.instructorsMatched || 0}/${progressSync.totalInstructors || 0} matched · ${progressSync.mappedCourses || 0} courses · ${progressSync.matched || 0} cells synced`);
    else toast.error(progressSync.error || "BigQuery sync unavailable");
  }, [progressSync, toast]);

  // When a cell enters edit mode, open its native dropdown/picker immediately (single click).
  useEffect(() => {
    if (!edit || !editRef.current) return;
    const el = editRef.current as any;
    try { el.showPicker?.(); } catch { /* not supported — autoFocus still applies */ }
  }, [edit]);

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

  useEffect(() => {
    const scroller = wrapRef.current?.closest("main") as HTMLElement | null;
    const thead = theadRef.current;
    if (!scroller || !thead) return;
    const onScroll = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wrapTop = wrap.offsetTop; // table wrapper's offset within <main>'s scroll content
      const y = scroller.scrollTop - wrapTop;
      // Pin the header once the wrapper's top scrolls above the viewport; release at the bottom.
      const maxShift = wrap.clientHeight - thead.offsetHeight;
      const shift = Math.max(0, Math.min(y, maxShift));
      thead.style.transform = `translateY(${shift}px)`;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => { scroller.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [resp, tabKey, shown.length]);

  const onEdit = useCallback((id: string, colKey: string) => setEdit({ id, colKey }), []);
  const onCancel = useCallback(() => setEdit(null), []);
  const onSave = useCallback(async (row: any, col: any, value: string) => {
    if (isSyncedCourseColumn(col)) { setEdit(null); return; }
    const prev = cellValue(row, col);
    if (String(prev) === String(value)) { setEdit(null); return; }
    const apply = (rows: any[], v: string) => rows.map((r) => r.id !== row.id ? r : col.storage === "module"
      ? { ...r, moduleStatus: { ...r.moduleStatus, [col.key]: v || undefined } }
      : { ...r, values: { ...r.values, [col.key]: v } });
    setResp((d: any) => d ? { ...d, rows: apply(d.rows, value) } : d);
    setEdit(null);
    try {
      await api.post("/training", { instructorId: row.id, track: row.tab, target: col.storage, key: col.key, value });
      toast.success(`${col.label} updated${value ? `: ${value.replace(/\n/g, ", ")}` : " (cleared)"}`);
    } catch {
      toast.error(`${col.label} — save failed, reverted`);
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
      return [r.employeeId, r.name, ...cols.map((c: any) => {
        if (COMPUTED.has(c.key)) {
          const t = summaryCell(c.key, sum).text;
          return (c.key === "health_status" || c.key === "secondary_health_status") ? healthMeta(t).label : t;
        }
        const val = cellValue(r, c);
        return c.type === "STATUS" && isSyncedCourseColumn(c) ? statusDisplayValue(val, statusTone(val)) : (val || "");
      })];
    });
    const csv = Papa.unparse([header, ...out]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `training-${tabKey}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  if (!resp && loading) return <Loading />;
  if (err && !resp) return <div className="card p-6 text-sm text-rose-600">{err}</div>;

  // Vertical pinning is handled by translating the <thead> on page scroll; these classes keep the
  // backgrounds/borders, and the frozen ID/Name headers stay horizontally sticky via `left`.
  const head = "z-10 border-b border-slate-200 bg-slate-50 text-slate-600";
  const frozenHead = "sticky z-30 border-b border-slate-200 bg-slate-50 text-slate-600";
  const grouped = segs.filter((s) => s.group);

  return (
    // Normal page flow (like Master/Users): the PAGE (<main>) scrolls vertically, the card only
    // scrolls horizontally, and the pagination sits below the full table at the bottom of the page.
    <div className="flex flex-col gap-3">
      <div className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800"><GraduationCap className="h-6 w-6 text-brand-600" /> Training Stats</h1>
              <span className="text-2xl font-light text-slate-300">·</span>
              {/* Track is chosen here, folded into the title — no separate tab strip. */}
              <TrackDropdown tracks={tracks} activeKey={tabKey} onSelect={goTrack} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name or ID…" className="input w-56 pl-9" />
              </div>
              <div className="w-48"><ScrollSelect value={cmFilter} placeholder="All managers" onChange={(v) => { setCmFilter(v); setPage(0); }}
                options={[{ value: "", label: "All managers" }, ...managers.map((m) => ({ value: m, label: m }))]} /></div>
              <button onClick={exportCsv} className="btn btn-ghost btn-sm" title="Export the current table as CSV"><Download className="h-4 w-4" /> Export CSV</button>
              {activeFilterCount > 0 && <button onClick={clearFilters} className="btn btn-ghost btn-sm text-rose-600 hover:text-rose-700">Clear all ({activeFilterCount})</button>}
              <button onClick={() => setFilterOpen(true)} className="btn btn-ghost btn-sm">
                <SlidersHorizontal className="h-4 w-4" /> Filter
                {activeFilterCount > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{activeFilterCount}</span>}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-slate-500">
            {[["completed", "Completed"], ["progress", "In Progress"], ["hold", "On Hold"], ["notstarted", "Not Started"]].map(([k, l]) => (
              <span key={k} className="flex items-center gap-1.5"><span className={`inline-block h-3 w-3 rounded ${TONE[k]}`} /> {l}</span>
            ))}
          </div>
        </div>
      </div>

      <div ref={wrapRef} className="card overflow-x-auto p-0">
        <table className="border-separate border-spacing-0 text-xs">
          <thead ref={theadRef} className="relative z-30">
            <tr>
              <th rowSpan={2} className={`${frozenHead} px-3 py-2 text-left font-semibold`} style={{ left: 0, width: ID_W, minWidth: ID_W }}>Employee ID</th>
              <th rowSpan={2} className={`${frozenHead} whitespace-nowrap border-r border-slate-200 px-3 py-2 text-left font-semibold`} style={{ left: ID_W, minWidth: NAME_W }}>Name</th>
              {segs.map((s, i) => s.group
                ? <th key={i} colSpan={s.cols.length} className={`${head} border-l border-slate-200 px-2 py-2 text-center font-semibold`}>{s.group}</th>
                : s.cols.map((c) => <th key={c.id} rowSpan={2} className={`${head} border-l border-slate-200 px-2 py-2 text-left font-semibold`} style={{ minWidth: 100 }}>{c.label}</th>)
              )}
            </tr>
            <tr>
              {grouped.flatMap((s) => s.cols).map((c) => <th key={c.id} className={`${head} whitespace-nowrap px-1.5 py-2 text-center font-medium`} style={{ minWidth: 88 }}><div className="leading-tight">{c.label}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <TrainingRow key={r.id} r={r} cols={cols}
                editingColKey={edit && edit.id === r.id ? edit.colKey : null}
                onEdit={onEdit} onSave={onSave} onCancel={onCancel} editRef={editRef} />
            ))}
            {!loading && !shown.length && (
              <tr><td colSpan={2 + cols.length} className="px-5 py-16 text-center">
                <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-slate-400">
                  <Inbox className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">{(activeFilterCount || q) ? "No instructors match your filters" : "No instructors in this track"}</p>
                  {(activeFilterCount || q)
                    ? <button onClick={() => { clearFilters(); setQ(""); }} className="text-xs font-medium text-brand-600 hover:text-brand-700">Clear filters</button>
                    : <p className="text-xs">Try selecting a different track above.</p>}
                </div>
              </td></tr>
            )}
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

// Track chooser folded into the page title — a sleek pill dropdown (icon · label · count ▾).
function TrackDropdown({ tracks, activeKey, onSelect }: { tracks: any[]; activeKey: string; onSelect: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number } | null>(null);

  const active = tracks.find((t) => t.key === activeKey) || tracks[0];
  const ActiveIcon = (active && TRACK_ICON[active.key]) || GraduationCap;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 6, minWidth: Math.max(r.width, 240) });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const reposition = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, place]);

  if (!active) return null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${open ? "border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-100" : "border-slate-300 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40"}`}
      >
        <ActiveIcon className="h-4 w-4 text-brand-600" />
        <span>{active.label}</span>
        <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-brand-100 px-1.5 text-[11px] font-bold text-brand-700">{active.count}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: pos.minWidth }}
          className="z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {tracks.map((t) => {
            const Icon = TRACK_ICON[t.key] || GraduationCap;
            const isActive = t.key === activeKey;
            return (
              <button
                key={t.key}
                onClick={() => { onSelect(t.key); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-brand-100 text-brand-600" : "bg-slate-100 text-slate-500"}`}><Icon className="h-4 w-4" /></span>
                <span className="flex-1 font-medium">{t.label}</span>
                <span className={`inline-flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${isActive ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>{t.count}</span>
                {isActive && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <ScrollSelect value={value} placeholder="Any" onChange={onChange} options={[{ value: "", label: "Any" }, ...options.map((o) => ({ value: o, label: o }))]} />
    </div>
  );
}
