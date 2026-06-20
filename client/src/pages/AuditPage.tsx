import { useEffect, useState } from "react";
import { Search, Download } from "lucide-react";
import { api, API_BASE } from "../api";
import { ROLE_LABEL } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";

const ACTIONS = ["FIELD_EDIT", "FIELD_ADD", "FIELD_ARCHIVE", "MAPPING_CHANGE", "LIFECYCLE_CHANGE", "NOTE_ADD", "REQUEST_DECISION", "INSTRUCTOR_CREATE", "INSTRUCTOR_DELETE", "USER_CREATE", "USER_UPDATE", "USER_DELETE"];

export default function AuditPage() {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const p = new URLSearchParams({ page: String(page) });
    if (dq) p.set("q", dq); if (action) p.set("action", action);
    api.get(`/audit?${p}`, { signal: ac.signal }).then((r) => { setData(r); setErr(null); }).catch((e) => { if (!isAbort(e)) setErr(e.message); });
    return () => ac.abort();
  }, [dq, action, page]);

  function exportCsv() {
    const p = new URLSearchParams();
    if (q) p.set("q", q); if (action) p.set("action", action);
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/audit/export.csv?${p}`; a.download = "audit-log.csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Audit Log</h1><p className="text-sm text-slate-500">Every change across the system, newest first.</p></div>
        <button onClick={exportCsv} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</button>
      </div>
      {err && <div className="card p-4 text-sm text-rose-600">{err}</div>}

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Instructor, actor, field, reason…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <div><label className="label">Action</label>
          <select className="input w-52" value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }}>
            <option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{data?.total ?? "…"} entries</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">When</th><th className="px-5 py-3">Who</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Instructor</th><th className="px-5 py-3">Field</th><th className="px-5 py-3">Change</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Proof</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.entries.map((a: any) => (
                <tr key={a.id} className="hover:bg-slate-50 align-top">
                  <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{a.actorName}{a.actorRole && <div className="text-[11px] text-slate-400">{ROLE_LABEL[a.actorRole] || a.actorRole}</div>}</td>
                  <td className="px-5 py-3"><span className="chip chip-gray">{a.action.replace(/_/g, " ").toLowerCase()}</span></td>
                  <td className="px-5 py-3 text-slate-600">{a.instructorName || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{a.fieldName || "—"}</td>
                  <td className="px-5 py-3 text-xs">{a.oldValue || a.newValue ? <span><span className="text-slate-400 line-through">{a.oldValue || "—"}</span> → <span className="text-slate-700">{a.newValue || "—"}</span></span> : "—"}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{a.reason || "—"}</td>
                  <td className="px-5 py-3 text-xs">{a.proofPath ? <a href={`${API_BASE}/api/audit/proof/${a.proofPath}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">view</a> : "—"}</td>
                </tr>
              ))}
              {data && !data.entries.length && <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">No audit entries match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {data.page} of {data.pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn btn-ghost btn-sm disabled:opacity-40">← Prev</button>
            <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="btn btn-ghost btn-sm disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
