import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "../api";
import { LIFECYCLE_LABEL } from "../auth";

const MODULE_LABEL: Record<string, string> = {
  PERSONAL: "Personal Details", HIRING: "Hiring Details", TRAINING: "Training Stats",
  DEPLOYMENT: "Deployment", PERFORMANCE: "Performance", LIFECYCLE: "Lifecycle & Status", EXIT: "Exit / Offboarding",
};
const MODULE_ORDER = ["PERSONAL", "HIRING", "TRAINING", "DEPLOYMENT", "PERFORMANCE"];

export default function PrintProfilePage() {
  const { id } = useParams();
  const [p, setP] = useState<any>(null);
  useEffect(() => { let on = true; api.get(`/instructors/${id}`).then((r) => on && setP(r)).catch(() => {}); return () => { on = false; }; }, [id]);
  useEffect(() => { if (!p) return; const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); }, [p]);
  if (!p) return <div className="flex min-h-screen items-center justify-center gap-3 text-slate-400"><Loader2 className="h-9 w-9 animate-spin text-brand-600" /></div>;
  const inst = p.instructor || {};
  const fmt = (v: any) => (v === true ? "Yes" : v === false ? "No" : v || "—");

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 text-slate-800">
      <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold">{inst.name || "—"}</h1>
          <p className="text-sm text-slate-500">{inst.employeeId} · {inst.campus || "no campus"} · Manager: {inst.managerName}</p>
          <p className="text-sm text-slate-500">Status: {LIFECYCLE_LABEL[inst.status] || inst.status}</p>
        </div>
        <button onClick={() => window.print()} className="btn btn-primary btn-sm print:hidden">Print / Save PDF</button>
      </div>

      {MODULE_ORDER.filter((m) => p.byModule?.[m]?.length).map((m) => (
        <section key={m} className="mb-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{MODULE_LABEL[m]}</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2">
            {(p.byModule?.[m] || []).map((f: any) => (
              <div key={f.key} className="flex flex-col border-b border-slate-100 py-1">
                <dt className="text-xs text-slate-400">{f.label}</dt>
                <dd className="text-sm">{fmt(f.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {p.skills?.list?.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Skills — {p.skills.track} ({p.skills.done}/{p.skills.list.length})</h2>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {p.skills.list.map((s: any) => <li key={s.key}>{s.done ? "✓" : "○"} {s.label}</li>)}
          </ul>
        </section>
      )}

      <p className="mt-8 text-[10px] text-slate-400">Generated {new Date().toLocaleString()} · FacultyOps · Confidential</p>
    </div>
  );
}
