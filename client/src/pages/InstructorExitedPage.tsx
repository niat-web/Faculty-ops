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

  // Full EXIT-sheet column set, in sheet order. `wrap` widens the cell for long free-text.
  const COLS: { label: string; get: (i: any) => string; wrap?: boolean }[] = [
    { label: "Department", get: (i) => i.department },
    { label: "Capability Manager", get: (i) => i.managerName || "" },
    { label: "Work Location", get: (i) => i.campus },
    { label: "Contribution", get: (i) => i.contribution },
    { label: "Contribution Region", get: (i) => i.contributionRegion },
    { label: "Reporting Manager (Darwin)", get: (i) => i.reportingManager },
    { label: "Payroll", get: (i) => i.payroll },
    { label: "Role", get: (i) => i.designation },
    { label: "Phone Number", get: (i) => i.phone },
    { label: "Mail ID", get: (i) => i.email },
    { label: "University Mail Id", get: (i) => i.universityMail },
    { label: "DOJ", get: (i) => i.doj },
    { label: "Qualification", get: (i) => i.qualification },
    { label: "Domain", get: (i) => i.domain },
    { label: "UID", get: (i) => i.uid },
    { label: "Gender", get: (i) => i.gender },
    { label: "Native language", get: (i) => i.nativeLanguage },
    { label: "Portal / Assets / Drive Access", get: (i) => i.access },
    { label: "Capability Manager Employee ID", get: (i) => i.cmEmployeeId },
    { label: "Exit Date", get: (i) => i.exitDate },
    { label: "Remarks", get: (i) => i.remarks, wrap: true },
    { label: "Type Of Exit", get: (i) => i.typeOfExit },
    { label: "Reason For Exit", get: (i) => i.exitReason, wrap: true },
    { label: "Indetailed Reason", get: (i) => i.exitDetailedReason, wrap: true },
  ];
  const NCOLS = COLS.length + 2; // + Employee ID + Name

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
                <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3">Employee ID</th>
                <th className="px-5 py-3">Name</th>
                {COLS.map((c) => <th key={c.label} className="px-5 py-3">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i: any) => (
                <tr key={i.id} className="group hover:bg-slate-50">
                  <td className="sticky left-0 z-10 bg-white px-5 py-3 font-mono text-xs text-slate-500 group-hover:bg-slate-50">{i.employeeId}</td>
                  <td className="px-5 py-3 font-medium"><Link to={`/app/instructors/${i.id}`} className="text-brand-700 hover:underline">{i.name}</Link></td>
                  {COLS.map((c) => {
                    const val = c.get(i);
                    return c.wrap
                      ? <td key={c.label} className="max-w-[20rem] truncate px-5 py-3 text-slate-500" title={val || ""}>{val || "—"}</td>
                      : <td key={c.label} className="px-5 py-3 text-slate-500">{val || "—"}</td>;
                  })}
                </tr>
              ))}
              {rows.length === 0 && data && (
                <tr><td colSpan={NCOLS} className="px-5 py-10 text-center text-slate-400">No exited instructors match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && <Pagination page={page} pages={data.pages} per={per} total={data.total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />}
    </div>
  );
}
