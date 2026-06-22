import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, History, Users2 } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Loading from "../components/Loading";
import ScrollSelect from "../components/ScrollSelect";

export default function MappingPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "managers" ? "managers" : "reassign";
  const setTab = (t: string) => setParams(t === "reassign" ? {} : { tab: t });

  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  function load() { api.get("/mapping").then(setData).catch((e) => toast.error(e.message)); }
  useEffect(() => { load(); }, []);

  const cms: any[] = data?.cms || [];
  const instructors: any[] = data?.instructors || [];
  const managers: any[] = data?.managers || [];
  const cmName = (id: string | null) => cms.find((c) => c.id === id)?.name || "— unassigned —";

  async function reassign(instructorIds: string[], managerId: string) {
    if (!managerId) return;
    setBusy(true);
    try { const r = await api.post("/mapping/reassign", { instructorIds, managerId }); toast.success(`Reassigned ${r.changed} reportee(s).`); load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  if (!data) return <Loading />;

  const TabBtn = ({ id, label, count }: { id: string; label: string; count?: number }) => (
    <button onClick={() => setTab(id)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      {label}{count != null && <span className="ml-1.5 text-xs text-slate-400">({count})</span>}
    </button>
  );

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Assignments</h1><p className="text-sm text-slate-500">Map instructors to their Capability Manager. Reassignment preserves history and prevents orphaned reportees.</p></div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabBtn id="reassign" label="Reassign" />
        <TabBtn id="managers" label="Capability Managers" count={managers.length} />
      </div>

      {tab === "reassign" ? (
        <ReassignTab cms={cms} instructors={instructors} cmName={cmName} busy={busy} reassign={reassign} toast={toast} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-5 py-3">Capability Manager</th><th className="px-5 py-3">Reports to</th><th className="px-5 py-3">Reportees</th><th className="px-5 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Users2 className="h-4 w-4" /></span><span className="font-medium text-slate-800">{m.name}</span></div></td>
                    <td className="px-5 py-3 text-slate-600">{m.reportsTo}</td>
                    <td className="px-5 py-3"><span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{m.reportees}</span></td>
                    <td className="px-5 py-3 text-right"><Link to={`/app/instructors?managerId=${m.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">View reportees <ArrowRight className="h-3.5 w-3.5" /></Link></td>
                  </tr>
                ))}
                {!managers.length && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">No capability managers.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReassignTab({ cms, instructors, cmName, busy, reassign, toast }: any) {
  const confirm = useConfirm();
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [q, setQ] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return instructors.filter((i: any) =>
      (!unassignedOnly || !i.managerId) &&
      (!n || i.name.toLowerCase().includes(n) || (i.employeeId || "").toLowerCase().includes(n) || (i.campus || "").toLowerCase().includes(n)));
  }, [instructors, q, unassignedOnly]);
  const unassignedCount = useMemo(() => instructors.filter((i: any) => !i.managerId).length, [instructors]);

  return (
    <div className="space-y-5">
      {/* Bulk reassign */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <h2 className="font-semibold">Bulk reassign reportees</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48"><label className="label">From manager</label>
            <ScrollSelect value={bulkFrom} onChange={setBulkFrom} placeholder="Choose…" options={[{ value: "", label: "Choose…" }, ...cms.map((c: any) => ({ value: c.id, label: c.name }))]} />
          </div>
          <ArrowRight className="mb-2 h-4 w-4 text-slate-300" />
          <div className="w-48"><label className="label">To manager</label>
            <ScrollSelect value={bulkTo} onChange={setBulkTo} placeholder="Choose…" options={[{ value: "", label: "Choose…" }, ...cms.map((c: any) => ({ value: c.id, label: c.name }))]} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy || !bulkFrom || !bulkTo || bulkFrom === bulkTo}
            onClick={async () => {
              const ids = instructors.filter((i: any) => i.managerId === bulkFrom).map((i: any) => i.id);
              if (!ids.length) { toast.error("That manager has no reportees."); return; }
              if (await confirm({ title: "Move reportees?", message: `Move ${ids.length} reportee(s) to ${cmName(bulkTo)}?`, confirmText: "Move", danger: false })) reassign(ids, bulkTo);
            }}>Move all reportees</button>
        </div>
      </div>

      {/* All instructors */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-500">All instructors ({filtered.length})</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} /> Unassigned only ({unassignedCount})</label>
            <input className="input w-64" placeholder="Filter name, ID, campus…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Employee ID</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Campus</th><th className="px-5 py-3">Current manager</th><th className="px-5 py-3">Reassign to</th><th className="px-5 py-3">History</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i: any) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{i.employeeId}</td>
                  <td className="px-5 py-3 font-medium"><Link to={`/app/instructors/${i.id}`} className="text-brand-700 hover:underline">{i.name}</Link></td>
                  <td className="px-5 py-3 text-slate-500">{i.campus || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{cmName(i.managerId)}</td>
                  <td className="px-5 py-3">
                    <div className="w-44">
                      <ScrollSelect value="" disabled={busy} placeholder="Change…" onChange={(v) => { if (v) reassign([i.id], v); }}
                        options={[{ value: "", label: "Change…" }, ...cms.filter((c: any) => c.id !== i.managerId).map((c: any) => ({ value: c.id, label: c.name }))]} />
                    </div>
                  </td>
                  <td className="px-5 py-3"><Link to={`/app/instructors/${i.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline"><History className="h-3.5 w-3.5" /> View</Link></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No instructors found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
