import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, ArrowUp, ArrowDown, GripVertical, RotateCcw, X } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Loading from "../components/Loading";
import Modal from "../components/Modal";
import { STATUS_OPTIONS, TONE, SHORT } from "../training";

const TYPES = ["STATUS", "DROPDOWN", "TEXT", "NUMBER", "DATE"];
const TYPE_HINT: Record<string, string> = {
  STATUS: "Completed / In Progress / On Hold / Not Started",
  DROPDOWN: "Pick from your own options",
  TEXT: "Free text", NUMBER: "Numeric", DATE: "Date picker",
};

export default function TrainingColumnsPage() {
  const { track } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [label, setLabel] = useState("");
  const [cols, setCols] = useState<any[]>([]);
  const [archived, setArchived] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null); // {} for new, col for edit
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function load() { api.get(`/training/columns?track=${track}`).then((r) => { setCols(r.columns); setArchived(r.archived || []); setLabel(r.label); }).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }
  useEffect(() => { setLoading(true); load(); }, [track]);

  async function del(c: any) {
    const used = c.inUse ? ` ${c.inUse} instructor(s) have data in this column —` : "";
    if (!(await confirm({ title: "Hide column?", message: `Hide column "${c.label}"?${used} their values are preserved and the column can be restored.`, confirmText: "Hide" }))) return;
    try { await api.del(`/training/columns/${c.id}`); toast.success("Column hidden."); load(); } catch (e: any) { toast.error(e.message); }
  }
  async function restore(c: any) {
    try { await api.post(`/training/columns/${c.id}/restore`); toast.success("Column restored."); load(); } catch (e: any) { toast.error(e.message); }
  }
  async function persistOrder(next: any[]) {
    try { await api.post(`/training/columns/reorder`, { track, orderedIds: next.map((c) => c.id) }); } catch (e: any) { toast.error(e.message); load(); }
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...cols]; const j = idx + dir; if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setCols(next); persistOrder(next);
  }
  // Drag-and-drop reorder — items shift live as you drag, persisted on drop.
  function onDragEnter(i: number) {
    if (dragIdx === null || dragIdx === i) return;
    setCols((prev) => { const next = [...prev]; const [m] = next.splice(dragIdx, 1); next.splice(i, 0, m); return next; });
    setDragIdx(i);
  }
  function onDragEnd() {
    if (dragIdx === null) return;
    setDragIdx(null);
    setCols((cur) => { persistOrder(cur); return cur; });
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <Link to="/app/settings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Dynamic Fields</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{label} — Training columns</h1><p className="text-sm text-slate-500">Drag rows to reorder · add, edit and type the columns shown in this track's Training Stats grid.</p></div>
        <button onClick={() => setEditing({})} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Add column</button>
      </div>

      {/* Column list */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{cols.length} column(s)</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Group</th><th className="px-5 py-3">Label</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Options</th><th className="px-5 py-3">In use</th><th className="px-5 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cols.map((c, i) => (
              <tr
                key={c.id}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={onDragEnd}
                className={`transition-colors ${dragIdx === i ? "bg-brand-50/60 opacity-50" : "hover:bg-slate-50"}`}
              >
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-1 text-slate-400">
                    <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" />
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === cols.length - 1} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-slate-500">{c.group || "—"}</td>
                <td className="px-5 py-2.5 font-medium">{c.label}</td>
                <td className="px-5 py-2.5"><span className="chip chip-gray">{c.type.toLowerCase()}</span></td>
                <td className="px-5 py-2.5 text-xs text-slate-500">{(c.type === "DROPDOWN" || c.type === "STATUS") ? ((c.options?.length ? c.options : STATUS_OPTIONS).join(", ") || "—") : "—"}</td>
                <td className="px-5 py-2.5 text-xs text-slate-400">{c.inUse || 0}</td>
                <td className="px-5 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEditing(c)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(c)} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!cols.length && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">No columns yet — add one.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Hidden / archived columns */}
      {archived.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-600">Hidden columns ({archived.length})</div>
          <ul className="divide-y divide-slate-100">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-slate-600">{c.group ? `${c.group} · ` : ""}{c.label} <span className="ml-1 text-xs text-slate-400">({c.type.toLowerCase()}{c.inUse ? ` · ${c.inUse} in use` : ""})</span></span>
                <button onClick={() => restore(c)} className="btn btn-ghost btn-sm"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live preview */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Live preview</h2>
        <PreviewTable cols={cols} />
      </div>

      {editing && <ColumnModal track={track!} col={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function PreviewTable({ cols }: { cols: any[] }) {
  const segs = useMemo(() => {
    const out: { group: string; cols: any[] }[] = [];
    for (const c of cols) { const last = out[out.length - 1]; if (last && last.group === (c.group || "")) last.cols.push(c); else out.push({ group: c.group || "", cols: [c] }); }
    return out;
  }, [cols]);
  const grouped = segs.filter((s) => s.group);
  const head = "border-b border-slate-200 bg-slate-50 text-slate-600";
  // two sample rows demonstrating each column type
  const opt = (c: any, i: number) => { const o = c.options?.length ? c.options : (c.type === "STATUS" ? STATUS_OPTIONS : []); return o[i] || o[0] || "—"; };
  const samples = [
    { employeeId: "NW0001234", name: "Sample Instructor A", v: (c: any) => (c.type === "STATUS" || c.type === "DROPDOWN") ? opt(c, 0) : c.type === "NUMBER" ? "100" : c.type === "DATE" ? "10-Jul-2026" : "Sample text" },
    { employeeId: "NW0005678", name: "Sample Instructor B", v: (c: any) => (c.type === "STATUS" || c.type === "DROPDOWN") ? opt(c, 1) : c.type === "NUMBER" ? "50" : c.type === "DATE" ? "01-Feb-2027" : "—" },
  ];
  const cell = (c: any, raw: string) => {
    if (c.type === "STATUS") { const t = (raw || "").toLowerCase().includes("complete") ? "completed" : (raw || "").toLowerCase().includes("progress") ? "progress" : "notstarted"; return <span className={`block px-2 py-1.5 text-center text-[11px] ${TONE[t]}`}>{SHORT[t] || raw}</span>; }
    return <span className="block px-3 py-1.5 text-[11px] text-slate-600">{raw}</span>;
  };
  return (
    <div className="card overflow-auto p-0">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th rowSpan={2} className={`${head} px-3 py-2 text-left font-semibold`} style={{ minWidth: 110 }}>Employee ID</th>
            <th rowSpan={2} className={`${head} px-3 py-2 text-left font-semibold`} style={{ minWidth: 180 }}>Name</th>
            {segs.map((s, i) => s.group
              ? <th key={i} colSpan={s.cols.length} className={`${head} border-l border-slate-200 px-3 py-2 text-center font-semibold`}>{s.group}</th>
              : s.cols.map((c) => <th key={c.id} rowSpan={2} className={`${head} border-l border-slate-200 px-3 py-2 text-left font-semibold`} style={{ minWidth: 120 }}>{c.label}</th>))}
          </tr>
          <tr>{grouped.flatMap((s) => s.cols).map((c) => <th key={c.id} className={`${head} px-2 py-2 text-center font-medium`} style={{ minWidth: 110 }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {samples.map((r, ri) => (
            <tr key={ri}>
              <td className="border-b border-slate-100 bg-white px-3 py-1.5 font-mono text-[11px] text-slate-600">{r.employeeId}</td>
              <td className="border-b border-slate-100 bg-white px-3 py-1.5 font-medium text-slate-800">{r.name}</td>
              {cols.map((c) => <td key={c.id} className="border-b border-l border-slate-100 p-0">{cell(c, r.v(c))}</td>)}
            </tr>
          ))}
          {!cols.length && <tr><td colSpan={2} className="px-5 py-8 text-center text-slate-400">Add columns to see the preview.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ColumnModal({ track, col, onClose, onSaved }: { track: string; col: any; onClose: () => void; onSaved: () => void }) {
  const isNew = !col.id;
  const [f, setF] = useState<any>({ label: col.label || "", group: col.group || "", type: col.type || "STATUS" });
  const [options, setOptions] = useState<string[]>(() => {
    const o: string[] = col.options || [];
    return (col.type || "STATUS") === "STATUS" && !o.length ? [...STATUS_OPTIONS] : o;
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const hasOptions = f.type === "STATUS" || f.type === "DROPDOWN";

  function changeType(t: string) {
    set("type", t);
    // Pre-fill the standard statuses when switching to STATUS with none defined.
    if (t === "STATUS" && !options.filter(Boolean).length) setOptions([...STATUS_OPTIONS]);
  }
  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const addOpt = () => setOptions((o) => [...o, ""]);
  const removeOpt = (i: number) => setOptions((o) => o.filter((_, j) => j !== i));

  async function save() {
    setBusy(true); setErr(null);
    const opts = hasOptions ? options.map((s) => s.trim()).filter(Boolean) : [];
    if (f.type === "DROPDOWN" && !opts.length) { setErr("Add at least one dropdown option."); setBusy(false); return; }
    try {
      if (isNew) await api.post(`/training/columns`, { track, label: f.label, group: f.group, type: f.type, options: opts });
      else await api.patch(`/training/columns/${col.id}`, { label: f.label, group: f.group, type: f.type, options: opts });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? "Add column" : `Edit “${col.label}”`} onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div><label className="label">Column label</label><input className="input" value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. React JS" /></div>
        <div><label className="label">Group / section header (optional)</label><input className="input" value={f.group} onChange={(e) => set("group", e.target.value)} placeholder="e.g. Frontend Development" /></div>
        <div><label className="label">Field type</label>
          <select className="input" value={f.type} onChange={(e) => changeType(e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <p className="mt-1 text-xs text-slate-400">{TYPE_HINT[f.type]}</p>
        </div>
        {hasOptions && (
          <div>
            <label className="label">{f.type === "STATUS" ? "Status values (editable)" : "Dropdown options"}</label>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input" value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={f.type === "STATUS" ? "e.g. Completed" : "e.g. DEPLOYED"} />
                  <button type="button" onClick={() => removeOpt(i)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={addOpt} className="btn btn-ghost btn-sm"><Plus className="h-4 w-4" /> Add option</button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy || !f.label.trim()} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button></div>
      </div>
    </Modal>
  );
}
