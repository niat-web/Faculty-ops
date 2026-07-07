import { useEffect, useState } from "react";
import { UserMinus } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { FormSkeleton } from "../../components/skeletons";

// Ops-only: how many days before an instructor's Darwinbox last-working-day to raise an exit alert.
const PRESETS = [2, 5, 10];

export default function ExitAlertsSettingsPage() {
  const toast = useToast();
  const [days, setDays] = useState<number | "">("");
  const [pending, setPending] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get("/settings/exit-alerts");
    setDays(r.exitAlerts.leadDays);
    setPending(r.counts?.pending ?? 0);
    setLoaded(true);
  }
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  async function save() {
    setBusy(true);
    try { const r = await api.patch("/settings/exit-alerts", { leadDays: Number(days) || 0 }); setDays(r.exitAlerts.leadDays); toast.success("Exit alert lead time saved."); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (!loaded) return <FormSkeleton />;

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
              <button key={p} type="button" onClick={() => setDays(p)} className={`btn btn-sm ${Number(days) === p ? "btn-primary" : "btn-ghost border border-slate-200"}`}>{p} days</button>
            ))}
          </div>
          <input className="input" type="number" min={0} max={365} value={days} onChange={(e) => { const n = parseInt(e.target.value, 10); setDays(isNaN(n) ? "" : Math.min(365, Math.max(0, n))); }} />
          <p className="mt-1 text-xs text-slate-400">{!days || Number(days) === 0 ? "0 = alert only on/after the last working day." : `Alerts are raised ${days} day(s) before the last working day.`}</p>
        </div>
        <div className="mt-4 flex justify-end">
          <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}
