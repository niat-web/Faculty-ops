import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, X, MessageSquare, Paperclip, Search, Plus } from "lucide-react";
import { api, API_BASE } from "../api";
import { useAuth } from "../auth";
import Modal from "../components/Modal";
import ScrollSelect from "../components/ScrollSelect";

const STATUS_CHIP: Record<string, string> = { PENDING: "chip-necessary", APPROVED: "chip-public", REJECTED: "chip-sensitive" };

export default function RequestsPage() {
  const { user } = useAuth();
  const canDecide = user!.role === "SENIOR_MANAGER" || user!.role === "OPS_ADMIN";
  const canRaise = ["CAPABILITY_MANAGER", "SENIOR_MANAGER", "OPS_ADMIN"].includes(user!.role);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<any>(null); // request being decided/commented
  const [newReq, setNewReq] = useState(false); // "New request" modal
  const [hq, setHq] = useState(""); // history search
  const [hStatus, setHStatus] = useState(""); // history status filter

  const { id: focusId } = useParams(); // deep link: /app/requests/:id opens that one request
  function load() {
    api.get(`/requests`).then((r) => { setData(r); setErr(null); }).catch((e) => setErr(e.message));
  }
  useEffect(() => { load(); }, []);
  // When arriving via a unique link, open exactly that request.
  useEffect(() => {
    if (!focusId || !data) return;
    const r = (data.requests || []).find((x: any) => x.id === focusId);
    if (r) setActive(r);
  }, [focusId, data]);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Edit Requests</h1><p className="text-sm text-slate-500">{canDecide ? "Approve or reject submitted changes, and raise your own." : "Track the status of changes you've submitted."}</p></div>
        {canRaise && <button onClick={() => setNewReq(true)} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> New request</button>}
      </div>

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
                {r.decidable && (
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
      {newReq && <NewRequestModal onClose={() => setNewReq(false)} onDone={() => { setNewReq(false); load(); }} />}
    </div>
  );
}

// Raise a new edit request: pick instructor → field (subject) → new value → reason.
function NewRequestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [instructors, setInstructors] = useState<any[]>([]);
  const [instructorId, setInstructorId] = useState("");
  const [fields, setFields] = useState<any[]>([]);
  const [fieldKey, setFieldKey] = useState("");
  const [loadingFields, setLoadingFields] = useState(false);
  const [value, setValue] = useState<any>("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/instructors?per=500&scope=all").then((r) => setInstructors(r.instructors || [])).catch((e) => setErr(e.message)); }, []);
  // Load that instructor's editable fields (excludes computed/file fields) when one is picked.
  useEffect(() => {
    if (!instructorId) { setFields([]); setFieldKey(""); return; }
    setLoadingFields(true); setFieldKey(""); setValue("");
    api.get(`/instructors/${instructorId}`).then((r) => {
      const fs: any[] = [];
      Object.values(r.byModule || {}).forEach((arr: any) => (arr as any[]).forEach((f) => { if (!f.computed && f.type !== "FILE") fs.push(f); }));
      setFields(fs);
    }).catch((e) => setErr(e.message)).finally(() => setLoadingFields(false));
  }, [instructorId]);
  // Prefill the current value when a field is chosen.
  useEffect(() => { const f = fields.find((x) => x.key === fieldKey); setValue(f ? (f.value ?? "") : ""); }, [fieldKey, fields]);

  const field = fields.find((f) => f.key === fieldKey) || null;

  async function submit() {
    if (!instructorId) { setErr("Pick an instructor."); return; }
    if (!fieldKey) { setErr("Pick a field."); return; }
    if (!reason.trim()) { setErr("A reason is required."); return; }
    setBusy(true); setErr(null);
    try { await api.post("/requests", { instructorId, fieldKey, newValue: String(value ?? ""), reason }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="New edit request" onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div>
          <label className="label">Instructor</label>
          <ScrollSelect value={instructorId} placeholder="Select instructor…" onChange={setInstructorId}
            options={instructors.map((i) => ({ value: i.id, label: `${i.name} (${i.employeeId})` }))} />
        </div>
        <div>
          <label className="label">Field (subject)</label>
          <ScrollSelect value={fieldKey} onChange={setFieldKey}
            placeholder={loadingFields ? "Loading fields…" : instructorId ? "Select field…" : "Pick an instructor first"}
            options={fields.map((f) => ({ value: f.key, label: f.label }))} />
        </div>
        {field && (
          <div>
            <label className="label">New value</label>
            {field.type === "DROPDOWN" ? (
              <ScrollSelect value={String(value ?? "")} onChange={setValue} placeholder="— select —"
                options={[{ value: "", label: "— select —" }, ...((field.options || []).includes(value) || !value ? [] : [{ value: String(value), label: String(value) }]), ...(field.options || []).map((o: string) => ({ value: o, label: o }))]} />
            ) : field.type === "BOOLEAN" ? (
              <ScrollSelect value={String(value)} onChange={setValue} options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]} />
            ) : (
              <input type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"} className="input"
                value={value as any} min={field.min ?? undefined} max={field.max ?? undefined} onChange={(e) => setValue(e.target.value)} />
            )}
          </div>
        )}
        <div><label className="label">Reason / note (sent to the approver)</label><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy} onClick={submit} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Submitting…" : "Submit request"}</button>
        </div>
      </div>
    </Modal>
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
