import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Download } from "lucide-react";
import { api, API_BASE } from "../api";
import { useAuth } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import Pagination from "../components/Pagination";
import ScrollSelect from "../components/ScrollSelect";

// Exited instructors only — a dedicated view with the exit-specific columns
// (Exit Date / Type of Exit / Reason / Detailed Reason) that the active lists don't show.
export default function InstructorExitedPage() {
  const { user } = useAuth();
  const canManage = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER";
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [department, setDepartment] = useState("");
  const [managerId, setManagerId] = useState("");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [cms, setCms] = useState<any[]>([]);

  useEffect(() => {
    api.get("/instructors/departments").then((r) => setDepartments(r.departments)).catch(() => {});
    if (canManage) api.get("/mapping").then((r) => setCms(r.cms)).catch(() => {});
  }, []);

  function params() {
    const p = new URLSearchParams({ scope: "exited" });
    if (dq) p.set("q", dq);
    if (department) p.set("department", department);
    if (managerId) p.set("managerId", managerId);
    return p;
  }
  useEffect(() => {
    const ac = new AbortController();
    const p = params(); p.set("page", String(page)); p.set("per", String(per));
    api.get(`/instructors?${p}`, { signal: ac.signal })
      .then((r) => { setData(r); setErr(null); if (page > r.pages && r.pages >= 1) setPage(r.pages); })
      .catch((e) => { if (!isAbort(e)) setErr(e.message || "Failed to load exited instructors"); });
    return () => ac.abort();
  }, [dq, department, managerId, page, per]);

  function exportCsv() {
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/instructors/export.csv?${params()}`;
    a.download = "instructors-exited.csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  const rows: any[] = data?.instructors || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instructor Exited</h1>
          <p className="text-sm text-slate-500">Instructors who have exited NIAT — with exit details.</p>
        </div>
        <button onClick={exportCsv} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</button>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[200px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Name, ID, email…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <div className="w-64"><label className="label">Department</label>
          <ScrollSelect value={department} placeholder="All departments" onChange={(v) => { setPage(1); setDepartment(v); }}
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]} />
        </div>
        {canManage && (
          <div className="w-44"><label className="label">Manager</label>
            <ScrollSelect value={managerId} placeholder="All" onChange={(v) => { setPage(1); setManagerId(v); }}
              options={[{ value: "", label: "All" }, ...cms.map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
        )}
      </div>

      {err && <div className="card p-4 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{data?.total ?? "…"} exited instructor(s)</div>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Employee ID</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Manager</th>
                <th className="px-5 py-3">Exit Date</th>
                <th className="px-5 py-3">Type of Exit</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Detailed Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i: any) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{i.employeeId}</td>
                  <td className="px-5 py-3 font-medium"><Link to={`/app/instructors/${i.id}`} className="text-brand-700 hover:underline">{i.name}</Link></td>
                  <td className="px-5 py-3 text-slate-500">{i.department || "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{i.managerName || "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{i.exitDate || "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{i.typeOfExit || "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{i.exitReason || "—"}</td>
                  <td className="max-w-[24rem] truncate px-5 py-3 text-slate-500" title={i.exitDetailedReason || ""}>{i.exitDetailedReason || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && data && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No exited instructors match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && <Pagination page={page} pages={data.pages} per={per} total={data.total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />}
    </div>
  );
}
