import { useEffect, useMemo, useState } from "react";
import { EyeOff, RotateCcw, Search, Loader2 } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { useConfirm } from "../../confirm";
import { useDebouncedValue, isAbort } from "../../hooks";
import { SkeletonRows } from "../../components/scaffold";

type Removed = {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  reason: string;
  removedByName: string;
  removedAt: string;
  inDarwinbox: boolean;
};

// Settings → Removed. Lists everyone an admin has hidden from the app (from the Master multi-select
// "Remove"). Each entry is enriched from BOTH Darwinbox and MongoDB (deduped by Employee ID). Search by
// name / Employee ID / email. Restore brings a person back everywhere. Nothing here is deleted from
// Darwinbox or MongoDB — this is purely a visibility toggle.
export default function RemovedSettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Removed[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // employeeIds ticked for bulk restore
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function load(query = "") {
    const r = await api.get(`/removed${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    setItems(r.removed || []);
    setTotal(r.total ?? (r.removed || []).length);
  }
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  // Server-side search (also enriches from Darwinbox), abortable + debounced.
  useEffect(() => {
    const ac = new AbortController();
    api.get(`/removed${dq.trim() ? `?q=${encodeURIComponent(dq)}` : ""}`, { signal: ac.signal })
      .then((r) => { setItems(r.removed || []); setTotal(r.total ?? (r.removed || []).length); })
      .catch((e) => { if (!isAbort(e)) toast.error(e.message); });
    return () => ac.abort();
  }, [dq]);

  async function restore(p: Removed) {
    if (!(await confirm({ title: "Restore person?", message: `Bring ${p.name} (${p.employeeId}) back into the Master, Exited, Org chart, Training and all counts?`, confirmText: "Restore" }))) return;
    setBusy(p.employeeId);
    try {
      await api.post("/removed/restore", { employeeIds: [p.employeeId] });
      toast.success(`${p.name} restored.`);
      setSelected((s) => { const n = new Set(s); n.delete(p.employeeId); return n; });
      await load(dq);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  // Bulk restore — un-hide every ticked person at once (backend takes the whole employeeIds array).
  async function bulkRestore() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!(await confirm({ title: `Restore ${ids.length} person(s)?`, message: `Bring ${ids.length} selected people back into the Master, Exited, Org chart, Training and all counts?`, confirmText: "Restore" }))) return;
    setBulkBusy(true);
    try {
      const r = await api.post("/removed/restore", { employeeIds: ids });
      toast.success(`${r.restored ?? ids.length} restored.`);
      setSelected(new Set());
      await load(dq);
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkBusy(false); }
  }

  const shown = items?.length ?? 0;
  const firstLoad = items === null; // first load — table body shimmers, page structure stays
  const visibleIds = (items || []).map((p) => p.employeeId);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleSelectAll = () => setSelected((s) => { const n = new Set(s); if (allSelected) visibleIds.forEach((id) => n.delete(id)); else visibleIds.forEach((id) => n.add(id)); return n; });
  const label = useMemo(() => (firstLoad ? "Loading…" : dq.trim() ? `${shown} of ${total} match “${dq.trim()}”` : `${total} removed`), [shown, total, dq, firstLoad]);

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><EyeOff className="h-5 w-5 text-amber-600" /><h2 className="font-semibold">Removed people</h2></div>
        <p className="mb-5 text-sm text-slate-500">
          People hidden from the app via <b>Instructor Master → Remove</b>. They're excluded from the Master, Exited, Org chart,
          Training Stats and every count — but <b>nothing is deleted</b> from Darwinbox or the database. Restore anyone to bring
          them back everywhere.
        </p>

        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search removed people by name, Employee ID or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {/* Selection toolbar — bulk restore the ticked people (Ops Admin only, like the rest of this page). */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
          <span className="text-sm font-medium text-brand-800">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={bulkRestore} disabled={bulkBusy} className="btn btn-primary btn-sm disabled:opacity-50">
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restore selected
            </button>
            <button onClick={() => setSelected(new Set())} className="btn btn-ghost btn-sm">Clear</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{label}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-10 px-5 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={firstLoad || !visibleIds.length} title="Select all" className="h-4 w-4 cursor-pointer rounded border-slate-300" />
                </th>
                <th className="px-5 py-3">Employee ID</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Removed by</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {firstLoad ? <SkeletonRows rows={8} cols={8} /> : <>
              {(items || []).map((p) => (
                <tr key={p.employeeId} className={`hover:bg-slate-50 ${selected.has(p.employeeId) ? "bg-brand-50/60" : ""}`}>
                  <td className="px-5 py-3">
                    <input type="checkbox" checked={selected.has(p.employeeId)} onChange={() => toggleSelect(p.employeeId)} className="h-4 w-4 cursor-pointer rounded border-slate-300" />
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.employeeId}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{p.name || "—"}</td>
                  <td className="px-5 py-3 text-slate-500 cell-trunc" title={p.email}>{p.email || "—"}</td>
                  <td className="px-5 py-3 text-slate-500 cell-trunc" title={p.department}>{p.department || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${p.inDarwinbox ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.inDarwinbox ? "Darwinbox + DB" : "Database only"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 cell-trunc" title={p.removedByName}>{p.removedByName || "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => restore(p)} disabled={busy === p.employeeId} title="Restore" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">
                      {busy === p.employeeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                    </button>
                  </td>
                </tr>
              ))}
              {!items?.length && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">{dq.trim() ? `No removed person matches “${dq.trim()}”.` : "No one has been removed. Hide people from Instructor Master → Multi-select → Remove."}</td></tr>}
              </>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
