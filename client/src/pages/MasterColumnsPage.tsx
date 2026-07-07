import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, ArrowUp, ArrowDown, GripVertical, RotateCcw, X, Lock } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import { ListPageSkeleton } from "../components/Skeleton";
import Modal from "../components/Modal";

const TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN"];
const TYPE_HINT: Record<string, string> = { TEXT: "Free text", NUMBER: "Numeric", DATE: "Date picker", DROPDOWN: "Pick from your own options" };
const SOURCE_LABEL: Record<string, string> = { core: "core", manager: "manager", value: "field" };

export default function MasterColumnsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [cols, setCols] = useState<any[]>([]);
  const [archived, setArchived] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null); // {} for new, col for edit
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);

  function load() { api.get(`/master/columns`).then((r) => { setCols(r.columns); setArchived(r.archived || []); }).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }
  useEffect(() => { load(); }, []);

  async function del(c: any) {
    if (c.locked) { toast.error("This is an essential column and can't be removed."); return; }
    const used = c.inUse ? ` ${c.inUse} instructor(s) have data here —` : "";
    if (!(await confirm({ title: "Hide column?", message: `Hide "${c.label}" from the Instructor Master grid?${used} their values are preserved and the column can be restored.`, confirmText: "Hide" }))) return;
    try { await api.del(`/master/columns/${c.id}`); toast.success("Column hidden."); load(); } catch (e: any) { toast.error(e.message); }
  }
  async function restore(c: any) {
    try { await api.post(`/master/columns/${c.id}/restore`); toast.success("Column restored."); load(); } catch (e: any) { toast.error(e.message); }
  }
  async function persistOrder(next: any[]) {
    try { await api.post(`/master/columns/reorder`, { orderedIds: next.map((c) => c.id) }); } catch (e: any) { toast.error(e.message); load(); }
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...cols]; const j = idx + dir; if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setCols(next); persistOrder(next);
  }
  function onDragEnter(i: number) {
    const from = dragIdxRef.current;
    if (from === null || from === i) return;
    setCols((prev) => { const next = [...prev]; const [m] = next.splice(from, 1); next.splice(i, 0, m); return next; });
    dragIdxRef.current = i; setDragIdx(i);
  }
  function onDragEnd() {
    if (dragIdxRef.current === null) return;
    dragIdxRef.current = null; setDragIdx(null);
    setCols((cur) => { persistOrder(cur); return cur; });
  }

  if (loading) return <ListPageSkeleton title="Instructor Master columns" subtitle="Add, edit, hide and reorder the columns shown in the Instructor Master grid." cols={6} filters={false} />;

  return (
    <div className="space-y-5">
      <Link to="/app/settings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Dynamic Fields</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Instructor Master columns</h1><p className="text-sm text-slate-500">Drag rows to reorder · add, edit, hide and type the columns shown in the Instructor Master grid. Changes apply for everyone.</p></div>
        <button onClick={() => setEditing({})} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Add column</button>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{cols.length} column(s)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Label</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Options</th><th className="px-5 py-3">In use</th><th className="px-5 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cols.map((c, i) => (
                <tr
                  key={c.id}
                  draggable
                  onDragStart={() => { dragIdxRef.current = i; setDragIdx(i); }}
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
                  <td className="px-5 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">{c.label}{c.locked && <Lock className="h-3 w-3 text-slate-300" />}</span>
                  </td>
                  <td className="px-5 py-2.5"><span className="chip chip-gray">{SOURCE_LABEL[c.source] || c.source}</span></td>
                  <td className="px-5 py-2.5"><span className="chip chip-gray">{String(c.type).toLowerCase()}</span></td>
                  <td className="px-5 py-2.5 max-w-[280px] truncate text-xs text-slate-500" title={(c.options || []).join(", ")}>{c.type === "DROPDOWN" ? ((c.options || []).join(", ") || "—") : "—"}</td>
                  <td className="px-5 py-2.5 text-xs text-slate-400">{c.inUse || 0}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(c)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(c)} disabled={c.locked} title={c.locked ? "Essential column" : "Hide"} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!cols.length && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">No columns yet — add one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {archived.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-600">Hidden columns ({archived.length})</div>
          <ul className="divide-y divide-slate-100">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-slate-600">{c.label} <span className="ml-1 text-xs text-slate-400">({String(c.type).toLowerCase()}{c.inUse ? ` · ${c.inUse} in use` : ""})</span></span>
                <button onClick={() => restore(c)} className="btn btn-ghost btn-sm"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && <ColumnModal col={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ColumnModal({ col, onClose, onSaved }: { col: any; onClose: () => void; onSaved: () => void }) {
  const isNew = !col.id;
  const isValue = isNew || col.source === "value"; // only value columns can change type/options
  const [f, setF] = useState<any>({ label: col.label || "", type: col.type || "TEXT" });
  const [options, setOptions] = useState<string[]>(col.options || []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const hasOptions = isValue && f.type === "DROPDOWN";

  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const addOpt = () => setOptions((o) => [...o, ""]);
  const removeOpt = (i: number) => setOptions((o) => o.filter((_, j) => j !== i));

  async function save() {
    setBusy(true); setErr(null);
    const opts = hasOptions ? options.map((s) => s.trim()).filter(Boolean) : [];
    if (hasOptions && !opts.length) { setErr("Add at least one dropdown option."); setBusy(false); return; }
    try {
      if (isNew) await api.post(`/master/columns`, { label: f.label, type: f.type, options: opts });
      else await api.patch(`/master/columns/${col.id}`, { label: f.label, ...(isValue ? { type: f.type, options: opts } : {}) });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? "Add column" : `Edit “${col.label}”`} onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div><label className="label">Column label</label><input className="input" value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Blood Group" /></div>
        {isValue ? (
          <div><label className="label">Field type</label>
            <select className="input" value={f.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <p className="mt-1 text-xs text-slate-400">{TYPE_HINT[f.type]}</p>
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">This is a {SOURCE_LABEL[col.source]} column — only its label can be changed.</p>
        )}
        {hasOptions && (
          <div>
            <label className="label">Dropdown options</label>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input" value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder="e.g. Option A" />
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
