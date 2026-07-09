import { useEffect, useState } from "react";
import { Wallet, Check } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { Skeleton } from "../../components/Skeleton";

// Ops-only: which payroll entities the Instructor Master grid shows (global default). Both default on.
// The Instructor Moved page always lists all University-payroll people regardless of this setting.
type Vis = { nxtwave: boolean; university: boolean };

export default function MasterPayrollSettingsPage() {
  const toast = useToast();
  const [vis, setVis] = useState<Vis>({ nxtwave: true, university: true });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/master/payroll-visibility")
      .then((r) => { if (r.payrollVisibility) setVis(r.payrollVisibility); setLoaded(true); })
      .catch((e) => { toast.error(e.message); setLoaded(true); });
  }, []);

  // Toggle one type and save immediately (never allow both off).
  async function toggle(kind: keyof Vis) {
    const next = { ...vis, [kind]: !vis[kind] };
    if (!next.nxtwave && !next.university) { toast.error("Show at least one payroll type."); return; }
    const prev = vis;
    setVis(next); setBusy(true);
    try { const r = await api.patch("/master/payroll-visibility", next); if (r.payrollVisibility) setVis(r.payrollVisibility); toast.success("Master payroll visibility saved."); }
    catch (e: any) { setVis(prev); toast.error(e.message || "Failed to save"); }
    finally { setBusy(false); }
  }

  const Row = ({ kind, label, hint }: { kind: keyof Vis; label: string; hint: string }) => {
    const on = vis[kind];
    return (
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white"}`}>
          {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
        <input type="checkbox" className="sr-only" checked={on} disabled={busy || !loaded} onChange={() => toggle(kind)} />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-slate-800">{label}</span>
          <span className="block text-xs text-slate-500">{hint}</span>
        </span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{on ? "Shown" : "Hidden"}</span>
      </label>
    );
  };

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2"><Wallet className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Master payroll visibility</h2></div>
      <p className="mb-5 text-sm text-slate-500">
        Choose which payroll types appear in the <b>Instructor Master</b> grid, for everyone. Untick one to hide those rows
        (at least one must stay on). This does <b>not</b> affect the <b>Instructor Moved</b> page, which always lists all
        University-payroll instructors.
      </p>

      {!loaded ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} width="100%" height="58px" borderRadius="10px" />)}</div>
      ) : (
        <div className="max-w-lg space-y-2.5">
          <Row kind="nxtwave" label="Nxtwave payroll" hint="Instructors on the Nxtwave payroll entity." />
          <Row kind="university" label="University payroll" hint="Instructors moved to a University payroll entity." />
        </div>
      )}
    </div>
  );
}
