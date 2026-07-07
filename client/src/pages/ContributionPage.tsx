import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Pencil, Trash2, Award } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import { useCachedGet } from "../hooks";
import { ListPageSkeleton } from "../components/Skeleton";
import Modal from "../components/Modal";

export default function ContributionPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useCachedGet<any>("/contribution"); // cached + revalidated; reload() after edits
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any>(null);

  const items: any[] = data?.items || [];
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return !n ? items : items.filter((i) => i.value.toLowerCase().includes(n));
  }, [items, q]);

  async function del(it: any) {
    if (!(await confirm({ title: "Clear contribution?", message: `Clear contribution "${it.value}" from ${it.count} instructor(s)? Their other data stays.`, confirmText: "Clear" }))) return;
    try { const r = await api.post("/contribution/delete", { value: it.value }); toast.success(`Cleared from ${r.changed} instructor(s).`); reload(); } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <ListPageSkeleton title="Contribution" subtitle="Each unique contribution and how many instructors have it." cols={3} />;
  if (!data?.field) return <div className="card p-6 text-sm text-slate-500">No <b>Contribution</b> field is defined in Dynamic Fields yet. Add a field labelled "Contribution" to use this page.</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Award className="h-6 w-6 text-brand-600" /> Contribution</h1>
        <p className="text-sm text-slate-500">Each unique contribution and how many instructors have it. Editing or deleting applies across your instructors.</p>
      </div>

      {/* Top filters */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Filter contribution…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="text-sm text-slate-500"><div className="label">Totals</div>{items.length} unique · {data.total} instructor(s)</div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{filtered.length} contribution(s)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Contribution</th><th className="px-5 py-3">Instructors</th><th className="px-5 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((it) => (
                <tr key={it.value} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800"><Link to={`/app/instructors/master?contribution=${encodeURIComponent(it.value)}`} className="text-brand-700 hover:underline" title={`View the ${it.count} instructor(s) with this contribution`}>{it.value}</Link></td>
                  <td className="px-5 py-3"><span className="chip chip-status">{it.count}</span></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(it)} title="Edit / rename" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(it)} title="Clear from instructors" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">No contributions found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <EditContributionModal item={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function EditContributionModal({ item, onClose, onDone }: any) {
  const [value, setValue] = useState(item.value);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!value.trim() || value.trim() === item.value) { onClose(); return; }
    setBusy(true); setErr(null);
    try { const r = await api.patch("/contribution", { oldValue: item.value, newValue: value.trim() }); onDone(); void r; } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Edit contribution`} onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <p className="text-sm text-slate-500">Renaming updates all <b>{item.count}</b> instructor(s) with “{item.value}”.</p>
        <div><label className="label">Contribution value</label><input autoFocus className="input" value={value} onChange={(e) => setValue(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-1"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button></div>
      </div>
    </Modal>
  );
}
