import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, MessageSquare, Paperclip, Search } from "lucide-react";
import { api, API_BASE } from "../api";
import { useAuth } from "../auth";

const STATUS_CHIP: Record<string, string> = { PENDING: "chip-necessary", APPROVED: "chip-public", REJECTED: "chip-sensitive" };

export default function RequestsPage() {
  const { user } = useAuth();
  const canDecide = user!.role === "SENIOR_MANAGER" || user!.role === "OPS_ADMIN";
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<any>(null); // request being decided/commented
  const [hq, setHq] = useState(""); // history search
  const [hStatus, setHStatus] = useState(""); // history status filter

  function load() {
    api.get(`/requests`).then((r) => { setData(r); setErr(null); }).catch((e) => setErr(e.message));
  }
  useEffect(() => { load(); }, []);

  const all: any[] = data?.requests || [];
  const pending = all.filter((r) => r.status === "PENDING");
  const history = useMemo(() => {
    const needle = hq.trim().toLowerCase();
    return all.filter((r) => r.status !== "PENDING")
      .filter((r) => !hStatus || r.status === hStatus)
      .filter((r) => !needle || r.instructorName.toLowerCase().includes(needle) || (r.fieldLabel || "").toLowerCase().includes(needle));
  }, [all, hq, hStatus]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Edit Requests</h1><p className="text-sm text-slate-500">{canDecide ? "Approve or reject changes submitted by your Capability Managers." : "Track the status of changes you've submitted."}</p></div>

      {err && <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={load} className="btn btn-ghost btn-sm">Retry</button></div>}

      {/* Pending */}
      <section className="space-y-3">
        <h2 className="font-semibold">Pending ({pending.length})</h2>
        {pending.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`chip ${STATUS_CHIP[r.status]}`}>{r.status.toLowerCase()}</span>
                  <Link to={`/app/instructors/${r.instructorId}`} className="font-semibold text-brand-700 hover:underline">{r.instructorName}</Link>
                </div>
                <div className="mt-1.5 text-sm"><span className="font-medium">{r.fieldLabel}:</span> <span className="text-slate-400 line-through">{r.oldValue || "—"}</span> → <span className="text-slate-800">{r.newValue}</span></div>
                <div className="mt-1 text-xs text-slate-500">Reason: {r.reason}</div>
                {r.proofPath && <a href={`${API_BASE}/api/requests/${r.id}/proof`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><Paperclip className="h-3 w-3" /> View proof document</a>}
                <div className="mt-1 text-[11px] text-slate-400">Requested by {r.requesterName} · {new Date(r.createdAt).toLocaleString()}</div>
                {r.comments?.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
                    {r.comments.map((c: any, i: number) => <li key={c.createdAt ? `${c.createdAt}-${i}` : i} className="text-xs text-slate-500"><span className="font-medium text-slate-600">{c.authorName}:</span> {c.body} <span className="text-slate-300">· {new Date(c.createdAt).toLocaleString()}</span></li>)}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => setActive({ ...r, mode: "comment" })} title="Comment" className="btn btn-ghost btn-sm"><MessageSquare className="h-4 w-4" /></button>
                {canDecide && (
                  <>
                    <button onClick={() => setActive({ ...r, mode: "APPROVE" })} className="btn btn-success btn-sm"><Check className="h-4 w-4" /> Approve</button>
                    <button onClick={() => setActive({ ...r, mode: "REJECT" })} className="btn btn-danger btn-sm"><X className="h-4 w-4" /> Reject</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {data && !pending.length && <div className="card p-8 text-center text-slate-400">Nothing pending. 🎉</div>}
      </section>

      {/* History */}
      <section className="space-y-3">
        <h2 className="font-semibold">History ({history.length})</h2>
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <label className="label">Search</label>
            <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Instructor or field…" value={hq} onChange={(e) => setHq(e.target.value)} />
          </div>
          <div><label className="label">Status</label>
            <select className="input w-40" value={hStatus} onChange={(e) => setHStatus(e.target.value)}>
              <option value="">All</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-5 py-3">Instructor</th><th className="px-5 py-3">Field</th><th className="px-5 py-3">Change</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Decision note</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className="px-5 py-3"><Link to={`/app/instructors/${r.instructorId}`} className="font-medium text-brand-700 hover:underline">{r.instructorName}</Link></td>
                    <td className="px-5 py-3 text-slate-600">{r.fieldLabel}</td>
                    <td className="px-5 py-3 text-xs"><span className="text-slate-400 line-through">{r.oldValue || "—"}</span> → <span className="text-slate-700">{r.newValue}</span></td>
                    <td className="px-5 py-3"><span className={`chip ${STATUS_CHIP[r.status]}`}>{r.status.toLowerCase()}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-500">{r.decisionComment || "—"}</td>
                  </tr>
                ))}
                {!history.length && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">No matching history.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {active && <DecideModal req={active} onClose={() => setActive(null)} onDone={() => { setActive(null); load(); }} />}
    </div>
  );
}

function DecideModal({ req, onClose, onDone }: any) {
  const isComment = req.mode === "comment";
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr(null);
    try {
      if (isComment) await api.post(`/requests/${req.id}/comment`, { body: comment });
      else await api.post(`/requests/${req.id}/decide`, { decision: req.mode, comment });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const title = isComment ? "Add comment" : req.mode === "APPROVE" ? "Approve request" : "Reject request";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 py-16" onMouseDown={onClose}>
      <div className="card w-full max-w-md p-5" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{req.fieldLabel} → {req.newValue} for {req.instructorName}</p>
        {err && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <textarea className="input mt-3" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={isComment ? "Your comment…" : "Optional note…"} />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy || (isComment && !comment.trim())} onClick={go} className={`btn btn-sm disabled:opacity-50 ${req.mode === "REJECT" ? "btn-danger" : req.mode === "APPROVE" ? "btn-success" : "btn-primary"}`}>{busy ? "Saving…" : isComment ? "Comment" : req.mode === "APPROVE" ? "Approve" : "Reject"}</button>
        </div>
      </div>
    </div>
  );
}
