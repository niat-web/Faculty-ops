import { useEffect, useState } from "react";
import { UserMinus, Building2, Plus, X } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { Skeleton } from "../../components/Skeleton";
import { SkeletonField } from "../../components/scaffold";

// Ops-only: how many days before an instructor's Darwinbox last-working-day to raise an exit alert.
const PRESETS = [2, 5, 10];

export default function ExitAlertsSettingsPage() {
  const toast = useToast();
  const [days, setDays] = useState<number | "">("");
  const [pending, setPending] = useState<number | null>(null);
  const [universities, setUniversities] = useState<string[]>([]);
  const [newUni, setNewUni] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get("/settings/exit-alerts");
    setDays(r.exitAlerts.leadDays);
    setPending(r.counts?.pending ?? 0);
    setUniversities(r.universities || []);
    setLoaded(true);
  }
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  async function save() {
    setBusy(true);
    try { const r = await api.patch("/settings/exit-alerts", { leadDays: Number(days) || 0 }); setDays(r.exitAlerts.leadDays); toast.success("Exit alert lead time saved."); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  // Universities are saved immediately on add/remove.
  async function saveUnis(list: string[]) {
    setUniversities(list);
    try { const r = await api.patch("/settings/exit-alerts", { universities: list }); setUniversities(r.universities || list); }
    catch (e: any) { toast.error(e.message); }
  }
  function addUni() {
    const v = newUni.trim();
    if (!v) return;
    if (universities.some((u) => u.toLowerCase() === v.toLowerCase())) { setNewUni(""); return; }
    saveUnis([...universities, v]); setNewUni("");
  }

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><UserMinus className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Exit alerts</h2></div>
        <p className="mb-5 text-sm text-slate-500">
          Every hour the app syncs Darwinbox and raises an alert when an instructor's last working day is approaching.
          Ops Admins &amp; Senior Managers get a notification; the instructor's Capability Manager confirms the outcome from their dashboard.
        </p>

        {pending != null && (
          <div className="mb-5 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
            <b className="text-slate-800">{pending}</b> exit alert(s) currently pending confirmation.
          </div>
        )}

        <div className="max-w-sm">
          <label className="label">Alert lead time (days before last working day)</label>
          <div className="mb-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" disabled={!loaded} onClick={() => setDays(p)} className={`btn btn-sm disabled:opacity-50 ${Number(days) === p ? "btn-primary" : "btn-ghost border border-slate-200"}`}>{p} days</button>
            ))}
          </div>
          {loaded ? <input className="input" type="number" min={0} max={365} value={days} onChange={(e) => { const n = parseInt(e.target.value, 10); setDays(isNaN(n) ? "" : Math.min(365, Math.max(0, n))); }} /> : <SkeletonField />}
          <p className="mt-1 text-xs text-slate-400">{!days || Number(days) === 0 ? "0 = alert only on/after the last working day." : `Alerts are raised ${days} day(s) before the last working day.`}</p>
        </div>
        <div className="mt-4 flex justify-end">
          <button disabled={busy || !loaded} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>

      {/* University names — offered in the CM exit modal for the "University Payroll" outcome. */}
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><Building2 className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">University names</h2></div>
        <p className="mb-4 text-sm text-slate-500">When a Capability Manager marks an exit as "Moved to University Payroll," they pick one of these universities. Changes save automatically.</p>
        <div className="mb-4 flex max-w-md gap-2">
          <input className="input" placeholder="Add a university name…" disabled={!loaded} value={newUni} onChange={(e) => setNewUni(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUni(); } }} />
          <button onClick={addUni} disabled={!loaded} className="btn btn-primary btn-sm shrink-0 disabled:opacity-50"><Plus className="h-4 w-4" /> Add</button>
        </div>
        {!loaded ? (
          <div className="flex flex-wrap gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="120px" height="30px" borderRadius="9999px" />)}</div>
        ) : universities.length ? (
          <div className="flex flex-wrap gap-2">
            {universities.map((u) => (
              <span key={u} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {u}
                <button onClick={() => saveUnis(universities.filter((x) => x !== u))} title="Remove" className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        ) : <p className="text-sm text-slate-400">No universities added yet.</p>}
      </div>
    </div>
  );
}
