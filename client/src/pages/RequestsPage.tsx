import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, X, MessageSquare, Paperclip, Search, Plus, Trash2, SlidersHorizontal, Download } from "lucide-react";
import { api, API_BASE } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Modal from "../components/Modal";
import ScrollSelect from "../components/ScrollSelect";
import MultiSelect from "../components/MultiSelect";

type HFilters = { status: string[]; field: string[]; requester: string[] };
const H_EMPTY: HFilters = { status: [], field: [], requester: [] };

const STATUS_CHIP: Record<string, string> = { PENDING: "chip-necessary", APPROVED: "chip-public", REJECTED: "chip-sensitive" };

export default function RequestsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canDecide = user!.role === "SENIOR_MANAGER" || user!.role === "OPS_ADMIN";
  const canRaise = ["CAPABILITY_MANAGER", "SENIOR_MANAGER", "OPS_ADMIN"].includes(user!.role);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<any>(null); // request being decided/commented
  const [activeBatch, setActiveBatch] = useState<any>(null); // batch being decided
  const [newReq, setNewReq] = useState(false); // "New request" modal
  const [hq, setHq] = useState(""); // history search
  const [hApplied, setHApplied] = useState<HFilters>(H_EMPTY);
  const [hDraft, setHDraft] = useState<HFilters>(H_EMPTY);
  const [hDrawer, setHDrawer] = useState(false);

  const { id: focusId } = useParams(); // deep link: /app/requests/:id opens that one request
  function load() {
    api.get(`/requests`).then((r) => { setData(r); setErr(null); }).catch((e) => setErr(e.message));
  }
  useEffect(() => { load(); }, []);
  async function removeRequest(r: any) {
    if (!(await confirm({ title: "Delete request?", message: `Withdraw your pending request for "${r.fieldLabel}"? The value won't change and this can't be undone.`, confirmText: "Delete", danger: true }))) return;
    try { await api.del(`/requests/${r.id}`); toast.success("Request deleted."); load(); } catch (e: any) { toast.error(e.message || "Failed to delete"); }
  }
  async function removeBatch(b: any) {
    if (!(await confirm({ title: "Delete request?", message: `Withdraw this pending batch of ${b.items.length} change(s)? Nothing will change and this can't be undone.`, confirmText: "Delete", danger: true }))) return;
    try { await api.del(`/requests/batch/${b.id}`); toast.success("Request deleted."); load(); } catch (e: any) { toast.error(e.message || "Failed to delete"); }
  }
  // When arriving via a unique link, open exactly that request.
  useEffect(() => {
    if (!focusId || !data) return;
    const r = (data.requests || []).find((x: any) => x.id === focusId);
    if (r) setActive(r);
  }, [focusId, data]);

  const all: any[] = data?.requests || [];
  const batches: any[] = data?.batches || [];
  const pendingBatches = batches.filter((b) => b.status === "PENDING");
  const pending = all.filter((r) => r.status === "PENDING");
  const histAll = useMemo(() => all.filter((r) => r.status !== "PENDING"), [all]);
  const fieldOpts = useMemo(() => [...new Set(histAll.map((r) => r.fieldLabel).filter(Boolean))].sort(), [histAll]);
  const requesterOpts = useMemo(() => [...new Set(histAll.map((r) => r.requesterName).filter(Boolean))].sort(), [histAll]);
  const history = useMemo(() => {
    const needle = hq.trim().toLowerCase();
    return histAll
      .filter((r) => !hApplied.status.length || hApplied.status.includes(r.status))
      .filter((r) => !hApplied.field.length || hApplied.field.includes(r.fieldLabel))
      .filter((r) => !hApplied.requester.length || hApplied.requester.includes(r.requesterName))
      .filter((r) => !needle || r.instructorName.toLowerCase().includes(needle) || (r.fieldLabel || "").toLowerCase().includes(needle));
  }, [histAll, hq, hApplied]);
  const hActive = hApplied.status.length + hApplied.field.length + hApplied.requester.length;
  function openHDrawer() { setHDraft(hApplied); setHDrawer(true); }
  function applyHFilters() { setHApplied(hDraft); setHDrawer(false); }
  function clearHFilters() { setHApplied(H_EMPTY); setHDraft(H_EMPTY); }
  function exportHistory() {
    const header = ["Instructor", "Field", "Old value", "New value", "Status", "Decision note", "Requested by"];
    const rows = history.map((r) => [r.instructorName, r.fieldLabel, r.oldValue || "", r.newValue || "", r.status, r.decisionComment || "", r.requesterName || ""]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "request-history.csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Edit Requests</h1><p className="text-sm text-slate-500">{canDecide ? "Approve or reject submitted changes, and raise your own." : "Track the status of changes you've submitted."}</p></div>
        {canRaise && <button onClick={() => setNewReq(true)} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> New request</button>}
      </div>

      {err && <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={load} className="btn btn-ghost btn-sm">Retry</button></div>}

      {/* Pending batch requests (multi-field submissions from CM/SM) */}
      {pendingBatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Pending batch changes ({pendingBatches.length})</h2>
          {pendingBatches.map((b) => {
            const instCount = new Set(b.items.map((i: any) => i.instructorId)).size;
            return (
              <div key={b.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="chip chip-necessary">pending</span>
                      <span className="text-sm font-semibold text-slate-800">{b.items.length} change(s) · {instCount} instructor(s)</span>
                    </div>
                    {b.reason && <div className="mt-1 text-xs text-slate-500">Reason: {b.reason}</div>}
                    <div className="mt-1 text-[11px] text-slate-400">Requested by {b.requesterName} · {new Date(b.createdAt).toLocaleString()}</div>
                    <ul className="mt-2 max-h-48 space-y-1 overflow-auto border-l-2 border-slate-100 pl-3 text-xs">
                      {b.items.map((it: any, i: number) => (
                        <li key={i}>
                          <Link to={`/app/instructors/${it.instructorId}`} className="font-medium text-brand-700 hover:underline">{it.instructorName}</Link>
                          {" · "}<span className="text-slate-600">{it.fieldLabel}:</span> <span className="text-slate-400 line-through">{it.oldValue || "—"}</span> → <span className="text-slate-800">{it.newValue || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {b.decidable && (
                      <>
                        <button onClick={() => setActiveBatch({ ...b, mode: "APPROVE" })} className="btn btn-success btn-sm"><Check className="h-4 w-4" /> Approve all</button>
                        <button onClick={() => setActiveBatch({ ...b, mode: "REJECT" })} className="btn btn-danger btn-sm"><X className="h-4 w-4" /> Reject all</button>
                      </>
                    )}
                    {b.deletable && <button onClick={() => removeBatch(b)} title="Delete request" className="btn btn-ghost btn-sm text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

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
                {r.deletable && <button onClick={() => removeRequest(r)} title="Delete request" className="btn btn-ghost btn-sm text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>}
              </div>
            </div>
          </div>
        ))}
        {data && !pending.length && <div className="card p-8 text-center text-slate-400">Nothing pending. 🎉</div>}
      </section>

      {/* History */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">History ({history.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input h-9 pl-9 text-sm" placeholder="Instructor or field…" value={hq} onChange={(e) => setHq(e.target.value)} />
            </div>
            <button onClick={openHDrawer} className="btn btn-ghost btn-sm shrink-0">
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {hActive > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{hActive}</span>}
            </button>
            {hActive > 0 && <button onClick={clearHFilters} className="text-sm font-medium text-rose-600 hover:text-rose-700">Clear filters</button>}
            <button onClick={exportHistory} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</button>
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
      {activeBatch && <BatchDecideModal batch={activeBatch} onClose={() => setActiveBatch(null)} onDone={() => { setActiveBatch(null); load(); }} />}
      {newReq && <NewRequestModal onClose={() => setNewReq(false)} onDone={() => { setNewReq(false); load(); }} />}

      {/* History filter drawer */}
      {hDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setHDrawer(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filter history</h2>
              <button onClick={() => setHDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div><label className="label">Status</label>
                <MultiSelect values={hDraft.status} onChange={(v) => setHDraft({ ...hDraft, status: v })} options={[{ value: "APPROVED", label: "approved" }, { value: "REJECTED", label: "rejected" }]} placeholder="All statuses" searchable={false} /></div>
              <div><label className="label">Field</label>
                <MultiSelect values={hDraft.field} onChange={(v) => setHDraft({ ...hDraft, field: v })} options={fieldOpts.map((f) => ({ value: f, label: f }))} placeholder="All fields" /></div>
              <div><label className="label">Requested by</label>
                <MultiSelect values={hDraft.requester} onChange={(v) => setHDraft({ ...hDraft, requester: v })} options={requesterOpts.map((r) => ({ value: r, label: r }))} placeholder="Anyone" /></div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setHDraft(H_EMPTY)} className="btn btn-ghost btn-sm">Clear</button>
              <button onClick={applyHFilters} className="btn btn-primary btn-sm">Apply filters</button>
            </div>
          </div>
        </div>
      )}
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
              <input type={field.type === "NUMBER" ? "number" : "text"} className="input"
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

function BatchDecideModal({ batch, onClose, onDone }: any) {
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const approve = batch.mode === "APPROVE";
  async function go() {
    setBusy(true); setErr(null);
    try { await api.post(`/requests/batch/${batch.id}/decide`, { decision: batch.mode, comment }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 py-16" onMouseDown={onClose}>
      <div className="card w-full max-w-md p-5" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="font-semibold">{approve ? "Approve batch" : "Reject batch"}</h2>
        <p className="mt-1 text-sm text-slate-500">{approve ? "Apply" : "Reject"} all {batch.items.length} change(s) from {batch.requesterName}.</p>
        {err && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <textarea className="input mt-3" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note…" />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy} onClick={go} className={`btn btn-sm disabled:opacity-50 ${approve ? "btn-success" : "btn-danger"}`}>{busy ? "Saving…" : approve ? "Approve all" : "Reject all"}</button>
        </div>
      </div>
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
