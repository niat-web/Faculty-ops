import { useEffect, useState } from "react";
import { Database, Trash2, Download } from "lucide-react";
import { api, API_BASE } from "../../api";
import { useToast } from "../../toast";
import { useConfirm } from "../../confirm";
import { Skeleton } from "../../components/Skeleton";
import { SkeletonField } from "../../components/scaffold";

type Counts = { audit: number; notifications: number; logins: number };

export default function DataSettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [days, setDays] = useState<number | "">("");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [pruning, setPruning] = useState(false);

  async function load() {
    const r = await api.get("/settings/data");
    setDays(r.data.retentionDays);
    setCounts(r.counts);
  }
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  async function save() {
    setBusy(true);
    try { const r = await api.patch("/settings/data", { retentionDays: Number(days) || 0 }); setDays(r.data.retentionDays); toast.success("Retention saved."); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function prune() {
    if (!(await confirm({ title: "Prune old data?", message: "Permanently delete audit-log and login-history entries older than the retention period. This cannot be undone.", confirmText: "Prune now", danger: true }))) return;
    setPruning(true);
    try {
      const r = await api.post("/settings/data/prune");
      if (r.note) toast.info(r.note);
      else toast.success(`Pruned ${r.prunedAudit} audit + ${r.prunedLogins} login entries.`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setPruning(false); }
  }

  const keepForever = !days || Number(days) <= 0;

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><Database className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Data &amp; Retention</h2></div>
        <p className="mb-5 text-sm text-slate-500">Control how long history is kept. Retention applies to the audit log and login history (instructor and user records are never auto-deleted).</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Audit log entries" value={counts?.audit} />
          <Stat label="Notifications" value={counts?.notifications} />
          <Stat label="Login events" value={counts?.logins} />
        </div>

        <div className="mt-6 max-w-sm">
          <label className="label">Retention period (days)</label>
          {counts ? <input className="input" type="number" min={0} max={3650} value={days} onChange={(e) => { const n = parseInt(e.target.value, 10); setDays(isNaN(n) ? "" : Math.min(3650, Math.max(0, n))); }} /> : <SkeletonField />}
          <p className="mt-1 text-xs text-slate-400">{keepForever ? "0 = keep forever (no automatic pruning)." : `Entries older than ${days} days are eligible for pruning.`}</p>
        </div>
        <div className="mt-4 flex justify-end">
          <button disabled={busy || !counts} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-1 font-semibold text-slate-800">Manual prune</h3>
        <p className="mb-4 text-sm text-slate-500">Immediately delete history older than the retention period above. {keepForever && <span className="text-amber-600">Set a retention period first.</span>}</p>
        <button disabled={pruning || keepForever} onClick={prune} className="btn btn-sm inline-flex items-center gap-2 border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> {pruning ? "Pruning…" : "Prune now"}
        </button>
      </div>

      <div className="card p-6">
        <h3 className="mb-1 font-semibold text-slate-800">Data exports</h3>
        <p className="mb-4 text-sm text-slate-500">Download a CSV snapshot of your data.</p>
        <div className="flex flex-wrap gap-2">
          <a href={`${API_BASE}/api/instructors/export.csv`} className="btn btn-ghost btn-sm inline-flex items-center gap-2"><Download className="h-4 w-4" /> Instructors</a>
          <a href={`${API_BASE}/api/audit/export.csv`} className="btn btn-ghost btn-sm inline-flex items-center gap-2"><Download className="h-4 w-4" /> Audit log</a>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      {value == null ? <Skeleton width="60px" height="28px" /> : <div className="text-2xl font-semibold text-slate-800">{value.toLocaleString()}</div>}
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
