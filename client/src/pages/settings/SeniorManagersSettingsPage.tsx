import { useEffect, useMemo, useRef, useState } from "react";
import { Network, Plus, Trash2, Search, Loader2 } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { useConfirm } from "../../confirm";
import { useDebouncedValue, isAbort } from "../../hooks";
import { SkeletonRows } from "../../components/scaffold";

type SM = { employeeId: string; name: string; email: string; department: string; designation: string };

export default function SeniorManagersSettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<SM[] | null>(null);
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [results, setResults] = useState<SM[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const r = await api.get("/settings/senior-managers");
    setItems(r.items || []);
  }
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  // Live Darwinbox search for the picker.
  useEffect(() => {
    if (!dq.trim()) { setResults([]); return; }
    const ac = new AbortController();
    setSearching(true);
    api.get(`/settings/senior-managers/search?q=${encodeURIComponent(dq)}`, { signal: ac.signal })
      .then((r) => { setResults(r.items || []); setOpen(true); })
      .catch((e) => { if (!isAbort(e)) toast.error(e.message); })
      .finally(() => setSearching(false));
    return () => ac.abort();
  }, [dq]);

  // Close the results dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const existing = useMemo(() => new Set((items || []).map((s) => s.employeeId)), [items]);

  async function add(p: SM) {
    setAdding(p.employeeId);
    try {
      const r = await api.post("/settings/senior-managers", { employeeId: p.employeeId });
      toast.success(`${p.name} added as Senior Manager.${r.userAccount === "created" ? " Pending user account created." : ""}`);
      setQ(""); setResults([]); setOpen(false);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setAdding(null); }
  }

  async function remove(s: SM) {
    if (!(await confirm({ title: "Remove Senior Manager?", message: `Remove ${s.name} from the Senior Managers list? Their user account (if any) is left untouched.`, confirmText: "Remove", danger: true }))) return;
    try { await api.del(`/settings/senior-managers/${encodeURIComponent(s.employeeId)}`); await load(); }
    catch (e: any) { toast.error(e.message); }
  }

  const firstLoad = items === null; // first load — table body shimmers, page structure stays

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><Network className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Senior Managers</h2></div>
        <p className="mb-5 text-sm text-slate-500">
          Add Senior Managers from Darwinbox. They drive the <b>Roles</b> page count and are mirrored into <b>Users</b> as
          inactive accounts (they can't sign in until you activate them there).
        </p>

        {/* Darwinbox picker */}
        <div ref={boxRef} className="relative max-w-xl">
          <label className="label">Add from Darwinbox</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          {searching && <Loader2 className="absolute right-3 top-[34px] h-4 w-4 animate-spin text-slate-400" />}
          <input className="input pl-9" placeholder="Search name or Employee ID…" value={q} onFocus={() => results.length && setOpen(true)} onChange={(e) => setQ(e.target.value)} />
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {results.map((p) => {
                const added = existing.has(p.employeeId);
                return (
                  <button key={p.employeeId} disabled={added || adding === p.employeeId} onClick={() => add(p)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{p.name} <span className="font-mono text-[11px] text-slate-400">{p.employeeId}</span></span>
                      <span className="block truncate text-xs text-slate-500">{p.designation || "—"}{p.department ? ` · ${p.department}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-brand-600">{added ? "Added" : adding === p.employeeId ? "Adding…" : <span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add</span>}</span>
                  </button>
                );
              })}
            </div>
          )}
          {open && !searching && dq.trim() && results.length === 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 shadow-lg">No Darwinbox employee matches “{dq}”.</div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{firstLoad ? "Loading…" : `${items!.length} Senior Manager(s)`}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Employee ID</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Department</th><th className="px-5 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {firstLoad ? <SkeletonRows rows={6} cols={5} /> : <>
              {items!.map((s) => (
                <tr key={s.employeeId} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{s.employeeId}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{s.name || "—"}</td>
                  <td className="px-5 py-3 text-slate-500 cell-trunc" title={s.email}>{s.email || "—"}</td>
                  <td className="px-5 py-3 text-slate-500 cell-trunc" title={s.department}>{s.department || "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => remove(s)} title="Remove" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {!items!.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No Senior Managers yet — add one from Darwinbox above.</td></tr>}
              </>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
