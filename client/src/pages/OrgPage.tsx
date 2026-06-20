import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import OrgChart, { type OrgData } from "../components/OrgChart";
import Loading from "../components/Loading";

export default function OrgPage() {
  const [raw, setRaw] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => { let on = true; api.get("/org").then((r) => { if (on) { setRaw(r); setErr(null); } }).catch((e) => on && setErr(e.message)); return () => { on = false; }; }, []);
  if (err) return <div className="card p-6 text-sm text-rose-600">{err}</div>;
  if (!raw) return <Loading />;

  // Map the API shape → the chart's data shape.
  const data: OrgData = {
    totalInstructors: raw.totalInstructors || 0,
    totalManagers: raw.totalManagers || 0,
    sms: (raw.seniors || []).map((s: any) => ({ id: s.id, name: s.name, cms: (s.capabilityManagers || []).map((c: any) => ({ id: c.id, name: c.name, count: c.reportees })) })),
  };

  return (
    <div className="flex h-[calc(100vh-130px)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Org Chart</h1>
        <p className="text-sm text-slate-500">Drag to pan · scroll to zoom · click a Senior Manager to fold their branch · click a Capability Manager to view reportees.</p>
      </div>

      <OrgChart data={data} />

      {raw.unassignedCMs?.length > 0 && (
        <div className="card shrink-0 p-4">
          <div className="mb-2 text-sm font-semibold text-amber-600">Unassigned Capability Managers</div>
          <div className="flex flex-wrap gap-2">
            {raw.unassignedCMs.map((c: any) => (
              <button key={c.id} onClick={() => navigate(`/app/instructors?managerId=${c.id}`)} className="inline-flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-1.5 text-sm font-medium hover:border-amber-300">
                {c.name} <span className="chip chip-status">{c.reportees}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
