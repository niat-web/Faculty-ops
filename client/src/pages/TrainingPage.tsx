import { useEffect, useMemo, useRef, useState } from "react";
import { Search, GraduationCap } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import Loading from "../components/Loading";
import Pagination from "../components/Pagination";
import { STATUS_OPTIONS, TONE, SHORT, statusTone } from "../training";

const ID_W = 116, NAME_W = 200;

export default function TrainingPage() {
  const toast = useToast();
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<Record<string, any[]>>({});
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tabKey, setTabKey] = useState("tech");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [edit, setEdit] = useState<any>(null); // { id, colKey }
  const editRef = useRef<HTMLSelectElement | HTMLInputElement | null>(null);

  // When a cell enters edit mode, open its native dropdown/picker immediately (single click).
  useEffect(() => {
    if (!edit || !editRef.current) return;
    const el = editRef.current as any;
    try { el.showPicker?.(); } catch { /* not supported — autoFocus still applies */ }
  }, [edit]);

  useEffect(() => {
    api.get("/training")
      .then((r) => { setData(r.rows); setColumns(r.columns); setTracks(r.tracks); const first = r.tracks.find((t: any) => t.count) || r.tracks[0]; if (first) setTabKey(first.key); })
      .catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const cols: any[] = columns[tabKey] || [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((r) => r.tab === tabKey && (!needle || r.name.toLowerCase().includes(needle) || (r.employeeId || "").toLowerCase().includes(needle)));
  }, [data, tabKey, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function cellValue(row: any, col: any) { return (col.storage === "module" ? row.moduleStatus?.[col.key] : row.values?.[col.key]) ?? ""; }

  async function save(row: any, col: any, value: string) {
    const prev = cellValue(row, col);
    if (String(prev) === String(value)) { setEdit(null); return; }
    setData((d) => d.map((r) => r.id !== row.id ? r : col.storage === "module"
      ? { ...r, moduleStatus: { ...r.moduleStatus, [col.key]: value || undefined } }
      : { ...r, values: { ...r.values, [col.key]: value } }));
    setEdit(null);
    try { await api.post("/training", { instructorId: row.id, track: tabKey, target: col.storage, key: col.key, value }); }
    catch (e: any) {
      toast.error("Save failed — reverted");
      setData((d) => d.map((r) => r.id !== row.id ? r : col.storage === "module" ? { ...r, moduleStatus: { ...r.moduleStatus, [col.key]: prev || undefined } } : { ...r, values: { ...r.values, [col.key]: prev } }));
    }
  }

  // Group consecutive columns sharing the same `group` for the two-row header.
  const segs = useMemo(() => {
    const out: { group: string; cols: any[] }[] = [];
    for (const c of cols) { const last = out[out.length - 1]; if (last && last.group === (c.group || "")) last.cols.push(c); else out.push({ group: c.group || "", cols: [c] }); }
    return out;
  }, [cols]);

  if (loading) return <Loading />;
  if (err) return <div className="card p-6 text-sm text-rose-600">{err}</div>;

  const head = "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600";
  const frozenHead = "sticky top-0 z-30 border-b border-slate-200 bg-slate-50 text-slate-600";
  const grouped = segs.filter((s) => s.group);
  const tab = tracks.find((t) => t.key === tabKey);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800"><GraduationCap className="h-6 w-6 text-brand-600" /> Instructors Training Stats</h1>
          <p className="text-sm text-slate-400">Module-level progress per track. {tab ? `Showing ${tab.count} instructor(s).` : ""}</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name or ID…" className="input w-64 pl-9" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tracks.map((t) => (
          <button key={t.key} onClick={() => { setTabKey(t.key); setPage(0); setEdit(null); }} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tabKey === t.key ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
            {t.label} <span className="opacity-70">({t.count})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {[["completed", "Completed"], ["progress", "In Progress"], ["hold", "On Hold"], ["notstarted", "Not Started"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5"><span className={`inline-block h-3 w-3 rounded ${TONE[k]}`} /> {l}</span>
        ))}
      </div>

      <div className="card overflow-auto p-0" style={{ maxHeight: "72vh" }}>
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className={`${frozenHead} px-3 py-2 text-left font-semibold`} style={{ left: 0, width: ID_W, minWidth: ID_W }}>Employee ID</th>
              <th rowSpan={2} className={`${frozenHead} px-3 py-2 text-left font-semibold`} style={{ left: ID_W, width: NAME_W, minWidth: NAME_W }}>Name</th>
              {segs.map((s, i) => s.group
                ? <th key={i} colSpan={s.cols.length} className={`${head} border-l border-slate-200 px-3 py-2 text-center font-semibold`}>{s.group}</th>
                : s.cols.map((c) => <th key={c.id} rowSpan={2} className={`${head} border-l border-slate-200 px-3 py-2 text-left font-semibold`} style={{ minWidth: 120 }}>{c.label}</th>)
              )}
            </tr>
            <tr>
              {grouped.flatMap((s) => s.cols).map((c) => <th key={c.id} className={`${head} px-2 py-2 text-center font-medium`} style={{ minWidth: 110, maxWidth: 140 }}><div className="leading-tight">{c.label}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="group">
                <td className="sticky z-20 border-b border-slate-100 bg-white px-3 py-1.5 font-mono text-[11px] text-slate-600" style={{ left: 0, width: ID_W, minWidth: ID_W }}>{r.employeeId}</td>
                <td className="sticky z-20 border-b border-slate-100 bg-white px-3 py-1.5 font-medium text-slate-800" style={{ left: ID_W, width: NAME_W, minWidth: NAME_W }}>{r.name}</td>
                {cols.map((col) => {
                  const val = cellValue(r, col);
                  const isEditing = edit && edit.id === r.id && edit.colKey === col.key;
                  const isStatus = col.type === "STATUS";
                  const tone = isStatus ? statusTone(val) : "other";
                  // Put the current value first in the dropdown, then the rest.
                  const baseOpts: string[] = col.options?.length ? col.options : (isStatus ? STATUS_OPTIONS : []);
                  const ordered = val && baseOpts.includes(val) ? [val, ...baseOpts.filter((o) => o !== val)] : baseOpts;
                  return (
                    <td key={col.id} className={`border-b border-l border-slate-100 p-0 ${isStatus ? "text-center" : ""}`}>
                      {isEditing ? (
                        col.type === "STATUS" || col.type === "DROPDOWN" ? (
                          <select ref={editRef as any} autoFocus defaultValue={val || ""} onBlur={() => setEdit(null)} onChange={(e) => save(r, col, e.target.value)} className="w-full bg-white px-1 py-1.5 text-xs outline-none ring-2 ring-brand-400">
                            {ordered.map((s: string) => <option key={s} value={s}>{s}</option>)}
                            <option value="">— clear —</option>
                          </select>
                        ) : (
                          <input ref={editRef as any} autoFocus type={col.type === "NUMBER" ? "number" : col.type === "DATE" ? "date" : "text"} defaultValue={val} onBlur={(e) => save(r, col, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="w-full bg-white px-2 py-1.5 text-xs outline-none ring-2 ring-brand-400" />
                        )
                      ) : isStatus ? (
                        <button onClick={() => setEdit({ id: r.id, colKey: col.key })} className={`block w-full px-2 py-1.5 text-[11px] ${TONE[tone]} hover:opacity-80`}>{SHORT[tone] || val || "—"}</button>
                      ) : (
                        <button onClick={() => setEdit({ id: r.id, colKey: col.key })} className="block w-full px-3 py-1.5 text-left text-[11px] text-slate-600 hover:bg-slate-50">{val || "—"}</button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={2 + cols.length} className="px-5 py-8 text-center text-slate-400">No instructors in this track.</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination page={safePage + 1} pages={pageCount} per={pageSize} total={filtered.length} onPage={(p) => setPage(p - 1)} onPer={(n) => { setPageSize(n); setPage(0); }} />
    </div>
  );
}
