import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, RefreshCw, Upload, FileText, Download, Printer, Loader2, Mail, Send, CheckCircle2, AlertCircle, MinusCircle } from "lucide-react";
import { api, API_BASE } from "../api";
import { useAuth, LIFECYCLE_LABEL } from "../auth";
import { useToast } from "../toast";
import { useConfirm, usePrompt } from "../confirm";
import Modal from "../components/Modal";
import { Skeleton } from "../components/Skeleton";
import ScrollSelect from "../components/ScrollSelect";
import RowActionsMenu from "../components/RowActionsMenu";
import { isHealthKey, healthChipClass, stripHealthEmoji } from "../trainingScore";

// Health-status fields show no emoji — the colour conveys the state (green/amber/red/grey).
function HealthChip({ value }: { value: any }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${healthChipClass(value)}`}>{stripHealthEmoji(value)}</span>;
}

// Scaffold-first shell: the real back-link + profile-card / side-nav / content-card frame render
// instantly; the person's name, tabs and field values shimmer until /instructors/:id resolves.
function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <Link to="/app/instructors" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> All instructors</Link>
      <div className="card flex flex-wrap items-center gap-4 p-6">
        <Skeleton width="64px" height="64px" borderRadius="16px" />
        <div className="flex-1 space-y-2"><Skeleton width="200px" height="24px" /><Skeleton width="280px" height="12px" /></div>
        <Skeleton width="200px" height="34px" borderRadius="10px" />
      </div>
      <div className="flex flex-col gap-5 lg:flex-row">
        <nav className="shrink-0 space-y-2 lg:w-56">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height="36px" borderRadius="10px" />)}
        </nav>
        <div className="min-w-0 flex-1">
          <div className="card space-y-4 p-6">
            <Skeleton width="35%" height="16px" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[200px_1fr] items-center gap-3 py-1"><Skeleton width="60%" height="14px" /><Skeleton width="80%" height="30px" borderRadius="8px" /></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Module labels/order now come dynamically from the profile payload (p.modules).
const LIFECYCLE_ORDER = ["ONBOARDING", "IN_TRAINING", "CONFIRMED", "TRANSFER", "EXIT_IN_PROGRESS", "EXITED", "REHIRED"];
const EXIT_TYPES = ["Resignation", "Termination", "End of Contract", "Absconding", "Other"];
const VIS_CHIP: Record<string, string> = { PUBLIC: "chip-public", NECESSARY: "chip-necessary", SENSITIVE: "chip-sensitive" };

// Shared sizing so the value cell stays EXACTLY the same size whether it is being
// displayed, hovered, or edited — clicking a value must never shift the layout.
// Every state has a 1px border (transparent when not editing) + identical padding + font.
const CELL_BASE = "w-full rounded-lg border px-3 py-1.5 text-sm leading-5";
const CELL_EDIT = `${CELL_BASE} border-slate-300 bg-white text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100`;
const CELL_VIEW = `${CELL_BASE} block cursor-text border-transparent text-left text-slate-800 hover:border-slate-300 hover:bg-slate-50`;
const CELL_STATIC = `${CELL_BASE} border-transparent text-slate-800`;
const EMPTY = <span className="text-slate-400">—</span>;

export default function InstructorProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("");
  const [editField, setEditField] = useState<any>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null); // inline-edit: which field key
  const inlineRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // Ops/SM edit instructor detail fields directly; a Capability Manager must send changes to their
  // Senior Manager for approval (a change request with proof). Status/notes/skills stay editable for CMs.
  const canEdit = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER" || user!.role === "CAPABILITY_MANAGER";
  const canEditFields = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER";
  const canRequest = user!.role === "CAPABILITY_MANAGER"; // CM → approval workflow
  const canAudit = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER"; // per-instructor audit tab stays Ops/SM
  const isOps = user!.role === "OPS_ADMIN";

  function load() { api.get(`/instructors/${id}`).then(setP).catch((e) => setErr(e.message)); }
  async function withdrawRequest(r: any) {
    if (!(await confirm({ title: "Delete request?", message: `Withdraw your pending request for "${r.fieldLabel}"? The value won't change and this can't be undone.`, confirmText: "Delete", danger: true }))) return;
    try { await api.del(`/requests/${r.id}`); toast.success("Request deleted."); load(); } catch (e: any) { toast.error(e.message || "Failed to delete"); }
  }
  // Ops/SM edit inline (direct, audited, no reason prompt); a Capability Manager opens the
  // request modal (their change needs SM approval with a reason).
  const startEdit = (f: any) => { if (canEditFields) setEditKey(f.key); else if (canRequest) setEditField(f); };
  useEffect(() => { setP(null); load(); }, [id]);

  // Open the native dropdown/date picker immediately when a cell enters inline-edit.
  useEffect(() => { if (editKey && inlineRef.current) { try { (inlineRef.current as any).showPicker?.(); } catch { /* not supported */ } } }, [editKey]);

  // Optimistically set a field's value across the loaded profile, then persist (audit-logged).
  function patchFieldValue(key: string, val: any) {
    setP((prev: any) => prev ? { ...prev, byModule: Object.fromEntries(Object.entries(prev.byModule).map(([m, arr]: any) => [m, arr.map((f: any) => f.key === key ? { ...f, value: val } : f)])) } : prev);
  }
  async function saveInline(f: any, raw: any) {
    const next = f.type === "BOOLEAN" ? (raw === true || raw === "true") : raw;
    if (String(f.value ?? "") === String(next ?? "")) { setEditKey(null); return; }
    const prev = f.value;
    patchFieldValue(f.key, next);
    setEditKey(null);
    try { await api.post(`/fields/value`, { instructorId: id, fieldKey: f.key, fieldLabel: f.label, oldValue: String(prev ?? ""), newValue: String(next), reason: "Inline edit" }); }
    catch (e: any) { toast.error(e.message || "Save failed — reverted"); patchFieldValue(f.key, prev); }
  }

  async function remove() {
    if (!(await confirm({ title: "Delete instructor?", message: `Delete ${p.instructor.name}? This cannot be undone.` }))) return;
    try { await api.del(`/instructors/${id}`); toast.success("Instructor deleted."); navigate("/app/instructors"); } catch (e: any) { toast.error(e.message); }
  }
  async function rehire() {
    const note = await prompt({ title: "Re-hire instructor", message: "Add an optional note for the lifecycle record:", placeholder: "Optional note…", confirmText: "Re-hire", multiline: true });
    if (note === null) return; // cancelled
    try { await api.post(`/instructors/${id}/rehire`, { note }); toast.success("Re-hired."); load(); } catch (e: any) { toast.error(e.message); }
  }

  if (err) return <div className="card p-6 text-sm text-rose-600">{err}</div>;
  if (!p) return <ProfileSkeleton />;

  // Field-table tabs come from the (dynamic) module list — incl. admin-created modules — excluding the
  // ones rendered with special UI (Lifecycle timeline / Exit form).
  const modLabel: Record<string, string> = Object.fromEntries((p.modules || []).map((m: any) => [m.key, m.label]));
  const moduleTabs = (p.modules || []).map((m: any) => m.key).filter((k: string) => k !== "LIFECYCLE" && k !== "EXIT" && p.byModule?.[k]?.length);
  const tabs = [...moduleTabs, ...(p.skills?.list?.length || p.skills?.moduleStatus?.length ? ["SKILLS"] : []), "LIFECYCLE", ...(p.exit ? ["EXIT"] : []), "NOTES", ...(p.documents !== null ? ["DOCUMENTS"] : []), "HISTORY", ...(canEdit && !p.isStaff ? ["MAILS"] : []), ...(canAudit ? ["AUDIT"] : [])];
  const active = tab || tabs[0] || "LIFECYCLE";
  const inst = p.instructor || {};
  const label = (t: string) => modLabel[t] || ({ SKILLS: "Skills", LIFECYCLE: "Lifecycle & Status", EXIT: "Exit / Offboarding", NOTES: "Notes", DOCUMENTS: "Documents", HISTORY: "History", MAILS: "Mails", AUDIT: "Audit" } as any)[t] || t;
  // Fields with an open change request awaiting Senior-Manager approval.
  const pendingByKey: Record<string, any> = Object.fromEntries((p.pendingRequests || []).map((r: any) => [r.fieldKey, r]));

  return (
    <div className="space-y-5">
      <Link to="/app/instructors" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> All instructors</Link>

      <div className="card flex flex-wrap items-center gap-4 p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-2xl font-bold text-brand-700">{(inst.name || "?").charAt(0)}</div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{inst.name}</h1>
          <p className="text-sm text-slate-500"><span className="font-mono">{inst.employeeId}</span> · {inst.campus || "no campus"} · Manager: {inst.managerName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-status text-sm">{LIFECYCLE_LABEL[inst.status] || inst.status}</span>
          <a href={`/print/instructors/${id}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><Printer className="h-4 w-4" /> Report card</a>
          {canEdit && <button onClick={() => setStatusOpen(true)} className="btn btn-ghost btn-sm"><RefreshCw className="h-4 w-4" /> Change status</button>}
          {canEdit && inst.status === "EXITED" && <button onClick={rehire} className="btn btn-success btn-sm">Re-hire</button>}
          {isOps && <button onClick={remove} className="btn btn-danger btn-sm"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <nav className="shrink-0 space-y-1 lg:w-56">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`nav-link w-full text-left ${active === t ? "nav-link-active" : ""}`}>{label(t)}</button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-5">
          {moduleTabs.includes(active) && (
            <div className="card p-6">
              <h2 className="mb-4 font-semibold">{label(active)}</h2>
              <dl className="divide-y divide-slate-100">
                {(p.byModule?.[active] || []).map((f: any) => (
                  <div key={f.key} className="group grid grid-cols-[200px_1fr] items-center gap-3 py-2">
                    <dt className="text-sm font-medium text-slate-600">{f.label}</dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <div className="min-w-0 flex-1">
                      {pendingByKey[f.key] ? (
                        <div>
                          <div className={CELL_STATIC}>{fmt(f.value) || EMPTY}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-amber-600">
                            <span>Pending approval → "{pendingByKey[f.key].newValue}" (by {pendingByKey[f.key].requesterName})</span>
                            {pendingByKey[f.key].requesterId === user!.id && (
                              <button onClick={() => withdrawRequest(pendingByKey[f.key])} title="Delete request" className="text-rose-500 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                        </div>
                      ) : editKey === f.key ? (
                        f.type === "DROPDOWN" ? (
                          <ScrollSelect autoOpen value={String(f.value ?? "")} options={[{ value: "", label: "— select —" }, ...(f.options || []).map((o: string) => ({ value: o, label: o }))]} onChange={(v) => saveInline(f, v)} onClose={() => setEditKey(null)} className={`${CELL_EDIT} flex items-center justify-between gap-2`} />
                        ) : f.type === "BOOLEAN" ? (
                          <select autoFocus ref={inlineRef as any} defaultValue={String(f.value ?? "false")} onBlur={() => setEditKey(null)} onChange={(e) => saveInline(f, e.target.value)} className={CELL_EDIT}><option value="false">No</option><option value="true">Yes</option></select>
                        ) : (
                          <input autoFocus ref={inlineRef as any} type={f.type === "NUMBER" ? "number" : "text"} defaultValue={String(f.value ?? "")} min={f.min ?? undefined} max={f.max ?? undefined} pattern={f.pattern || undefined} onBlur={(e) => saveInline(f, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditKey(null); }} className={CELL_EDIT} />
                        )
                      ) : ((canEditFields || canRequest) && f.type !== "FILE" && !f.computed) ? (
                        <button onClick={() => startEdit(f)} title={canRequest ? "Click to request change" : "Click to edit"} className={CELL_VIEW}>{fmt(f.value) || EMPTY}</button>
                      ) : (
                        <div className={CELL_STATIC}>{isHealthKey(f.key) && f.value ? <HealthChip value={f.value} /> : (fmt(f.value) || EMPTY)}</div>
                      )}
                      </div>
                      {!pendingByKey[f.key] && (canEditFields || canRequest) && f.type !== "FILE" && !f.computed && (
                        <button onClick={() => startEdit(f)} title={canRequest ? "Request change" : "Edit"} aria-label={`Edit ${f.label}`} className="shrink-0 opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100"><Pencil className="h-4 w-4 text-slate-400 hover:text-brand-600" /></button>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {active === "SKILLS" && <SkillsTab skills={p.skills} instructorId={id!} canEdit={canEdit} onChange={load} />}
          {active === "LIFECYCLE" && (
            <div className="card p-6">
              <h2 className="mb-4 font-semibold">Lifecycle & Status</h2>
              <ul className="space-y-3">
                {inst.lifecycle?.length ? inst.lifecycle.map((l: any, i: number) => (
                  <li key={i} className="flex items-start gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" /><div><div className="text-sm font-medium">{LIFECYCLE_LABEL[l.status] || l.status}</div>{l.note && <div className="text-xs text-slate-500">{l.note}</div>}<div className="text-[11px] text-slate-400">{l.actorName} · {new Date(l.createdAt).toLocaleString()}</div></div></li>
                )) : <li className="text-sm text-slate-400">No lifecycle events.</li>}
              </ul>
            </div>
          )}
          {active === "EXIT" && p.exit && <ExitTab exit={p.exit} instructorId={id!} canEdit={canEdit} onChange={load} />}
          {active === "NOTES" && <NotesTab notes={inst.notes} instructorId={id!} canEdit={canEdit} onChange={load} />}
          {active === "DOCUMENTS" && p.documents !== null && <DocumentsTab documents={p.documents} instructorId={id!} employeeId={inst.employeeId} canEdit={canEdit} onChange={load} />}
          {active === "HISTORY" && <HistoryTab instructorId={id!} />}
          {active === "MAILS" && <MailsTab instructorId={id!} canSend={canEdit} />}
          {active === "AUDIT" && <AuditTab instructorId={id!} />}
        </div>
      </div>

      {editField && <EditFieldModal field={editField} instructorId={id!} mode={canEditFields ? "edit" : "request"} onClose={() => setEditField(null)} onDone={() => { setEditField(null); load(); }} />}
      {statusOpen && <StatusModal current={inst.status} instructorId={id!} onClose={() => setStatusOpen(false)} onDone={() => { setStatusOpen(false); load(); }} />}
    </div>
  );
}

export function fmt(v: any) { if (v === true) return "Yes"; if (v === false) return "No"; return v; }

function Field({ label, value }: { label: string; value: any }) {
  return <div className="grid grid-cols-[200px_1fr] items-center gap-3 py-2"><dt className="text-sm font-medium text-slate-600">{label}</dt><dd className={CELL_STATIC}>{value || EMPTY}</dd></div>;
}

export function EditFieldModal({ field, instructorId, mode, onClose, onDone }: any) {
  const [value, setValue] = useState(field.value ?? "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!reason.trim()) { setErr("A reason is required."); return; }
    setBusy(true); setErr(null);
    try {
      if (mode === "edit") {
        await api.post(`/fields/value`, { instructorId, fieldKey: field.key, fieldLabel: field.label, oldValue: String(field.value ?? ""), newValue: String(value), reason });
      } else {
        await api.post(`/requests`, { instructorId, fieldKey: field.key, newValue: String(value), reason });
      }
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`${mode === "edit" ? "Edit" : "Request change"}: ${field.label}`} onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div>
          <label className="label">New value</label>
          {field.type === "DROPDOWN" ? (
            <ScrollSelect value={String(value ?? "")} onChange={(v) => setValue(v)} placeholder="— select —"
              options={[{ value: "", label: "— select —" }, ...((field.options || []).includes(value) || !value ? [] : [{ value: String(value), label: String(value) }]), ...(field.options || []).map((o: string) => ({ value: o, label: o }))]} />
          ) : field.type === "BOOLEAN" ? (
            <select className="input" value={String(value)} onChange={(e) => setValue(e.target.value === "true")}><option value="false">No</option><option value="true">Yes</option></select>
          ) : (
            <input type={field.type === "NUMBER" ? "number" : "text"} className="input" value={value as any}
              min={field.min ?? undefined} max={field.max ?? undefined} pattern={field.pattern || undefined}
              onChange={(e) => setValue(e.target.value)} />
          )}
          {field.type === "NUMBER" && (field.min != null || field.max != null) && <p className="mt-1 text-xs text-slate-400">Allowed: {field.min ?? "−∞"} to {field.max ?? "∞"}</p>}
        </div>
        <div><label className="label">Reason {mode === "request" ? "(sent to your Senior Manager)" : "(for the audit log)"}</label><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : mode === "edit" ? "Save" : "Submit request"}</button>
        </div>
      </div>
    </Modal>
  );
}

export function StatusModal({ current, instructorId, onClose, onDone }: any) {
  const [status, setStatus] = useState(current);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr(null);
    try { await api.post(`/instructors/${instructorId}/lifecycle`, { status, note }); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Change lifecycle status" onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div><label className="label">Status</label><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{LIFECYCLE_ORDER.map((s) => <option key={s} value={s}>{LIFECYCLE_LABEL[s]}</option>)}</select></div>
        <div><label className="label">Note (optional)</label><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-1"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy} onClick={go} className="btn btn-primary btn-sm disabled:opacity-50">Save</button></div>
      </div>
    </Modal>
  );
}

export function SkillsTab({ skills, instructorId, canEdit, onChange }: any) {
  const toast = useToast();
  const modules = skills.moduleStatus || [];
  const tone = (s: string) => { const t = (s || "").toLowerCase(); if (t.includes("complete")) return "bg-emerald-50 text-emerald-700"; if (t.includes("progress")) return "bg-amber-50 text-amber-700"; if (t.includes("hold")) return "bg-slate-100 text-slate-600"; if (t.includes("not started")) return "bg-rose-50 text-rose-700"; return "bg-slate-100 text-slate-600"; };
  async function toggle(key: string, done: boolean) { try { await api.post(`/instructors/${instructorId}/skills`, { key, done }); onChange(); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="space-y-5">
      {skills.list?.length > 0 && (
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{skills.track} · {skills.done}/{skills.list.length}</h2><span className="text-sm font-medium text-slate-500">{Math.round((skills.done / skills.list.length) * 100)}%</span></div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(skills.done / skills.list.length) * 100}%` }} /></div>
          {!canEdit && <p className="mb-3 text-xs text-amber-600">Read-only — only Senior Managers / Ops Admins can update skills.</p>}
          <ul className="divide-y divide-slate-100">{skills.list.map((s: any) => (
            <li key={s.key} className="flex items-center gap-2 py-2 text-sm">
              <input type="checkbox" disabled={!canEdit} checked={s.done} onChange={(e) => toggle(s.key, e.target.checked)} />
              <span className={s.done ? "text-slate-700" : "text-slate-500"}>{s.label}</span>
            </li>
          ))}</ul>
        </div>
      )}
      {modules.length > 0 && (
        <div className="card p-6"><h2 className="mb-1 font-semibold">Module progress {skills.track ? `· ${skills.track}` : ""}</h2>
          <p className="mb-4 text-xs text-slate-400">{modules.filter((m: any) => /complete/i.test(m.status)).length}/{modules.length} completed</p>
          <ul className="divide-y divide-slate-100">{modules.map((m: any) => <li key={m.name} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="text-slate-700">{m.name}</span><span className={`chip ${tone(m.status)}`}>{m.status}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function ExitTab({ exit, instructorId, canEdit, onChange }: any) {
  const toast = useToast();
  const [f, setF] = useState({ lastWorkingDay: exit.lastWorkingDay || "", typeOfExit: exit.typeOfExit || "", reason: exit.reason || "", detailedReason: exit.detailedReason || "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  async function save() { setBusy(true); try { await api.post(`/instructors/${instructorId}/exit`, f); onChange(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }
  async function toggleItem(key: string, done: boolean) { try { await api.post(`/instructors/${instructorId}/exit`, { items: { [key]: done } }); onChange(); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="space-y-5">
      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Exit / Offboarding</h2>
        {canEdit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Last working day</label><input type="text" className="input" placeholder="e.g. 04-Sep-2026" value={f.lastWorkingDay} onChange={(e) => set("lastWorkingDay", e.target.value)} /></div>
            <div><label className="label">Type of exit</label><select className="input" value={f.typeOfExit} onChange={(e) => set("typeOfExit", e.target.value)}><option value="">— select —</option>{EXIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="label">Reason</label><input className="input" value={f.reason} onChange={(e) => set("reason", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="label">Detailed reason</label><textarea className="input" rows={2} value={f.detailedReason} onChange={(e) => set("detailedReason", e.target.value)} /></div>
            <div className="sm:col-span-2 flex justify-end"><button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">Save exit details</button></div>
          </div>
        ) : (
          <dl className="divide-y divide-slate-100"><Field label="Last working day" value={f.lastWorkingDay} /><Field label="Type of exit" value={f.typeOfExit} /><Field label="Reason" value={f.reason} /><Field label="Detailed reason" value={f.detailedReason} /></dl>
        )}
      </div>
      <div className="card p-6">
        <h2 className="mb-3 font-semibold">Offboarding checklist</h2>
        <ul className="divide-y divide-slate-100">
          {exit.items.map((it: any) => (
            <li key={it.key} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={it.done} onChange={(e) => toggleItem(it.key, e.target.checked)} /><span className={it.done ? "text-slate-700" : "text-slate-500"}>{it.label}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function NotesTab({ notes, instructorId, canEdit, onChange }: any) {
  const toast = useToast();
  const confirm = useConfirm();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null); // keep an open kebab's row visible
  async function add() { if (!body.trim()) return; setBusy(true); try { await api.post(`/instructors/${instructorId}/notes`, { body }); setBody(""); onChange(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }
  async function saveEdit(id: string) { try { await api.patch(`/instructors/${instructorId}/notes/${id}`, { body: editText }); setEditId(null); onChange(); } catch (e: any) { toast.error(e.message); } }
  async function del(id: string) { if (!(await confirm({ title: "Delete note?", message: "Delete this note?" }))) return; try { await api.del(`/instructors/${instructorId}/notes/${id}`); onChange(); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="card p-6">
      <h2 className="mb-4 font-semibold">Notes</h2>
      <div className="mb-4 flex gap-2"><input className="input" placeholder="Add a note…" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /><button disabled={busy} onClick={add} className="btn btn-primary btn-sm shrink-0">Add</button></div>
      <ul className="space-y-3">
        {notes.length ? notes.map((n: any) => (
          <li key={n.id} className="group flex items-start justify-between gap-2 border-l-2 border-slate-100 pl-3">
            <div className="min-w-0 flex-1">
              {editId === n.id ? (
                <div className="flex gap-2"><input autoFocus className="input" value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit(n.id)} /><button onClick={() => saveEdit(n.id)} className="btn btn-primary btn-sm shrink-0">Save</button><button onClick={() => setEditId(null)} className="btn btn-ghost btn-sm shrink-0">Cancel</button></div>
              ) : (
                <><div className="text-sm text-slate-700">{n.body}</div><div className="text-[11px] text-slate-400">{n.authorName} · {new Date(n.createdAt).toLocaleString()}</div></>
              )}
            </div>
            {canEdit && editId !== n.id && (
              <div className={`shrink-0 transition group-hover:opacity-100 ${menuOpenId === n.id ? "opacity-100" : "opacity-0"}`}>
                <RowActionsMenu
                  onOpenChange={(o) => setMenuOpenId(o ? n.id : null)}
                  actions={[
                    { label: "Edit", icon: Pencil, onClick: () => { setEditId(n.id); setEditText(n.body); } },
                    { label: "Delete", icon: Trash2, danger: true, onClick: () => del(n.id) },
                  ]}
                />
              </div>
            )}
          </li>
        )) : <li className="text-sm text-slate-400">No notes yet.</li>}
      </ul>
    </div>
  );
}

export function DocumentsTab({ documents, instructorId, employeeId, canEdit, onChange }: any) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  // Certificates submitted via the public form (stored on Google Drive), matched by Employee ID.
  const [certs, setCerts] = useState<any[]>([]);
  useEffect(() => {
    if (!employeeId || employeeId === "NA") { setCerts([]); return; }
    api.get(`/certifications/for-employee/${encodeURIComponent(employeeId)}`).then((r) => setCerts(r.items || [])).catch(() => setCerts([]));
  }, [employeeId]);
  // Certificate file links come from the schema's FILE fields (labels + Drive urls) per submission.
  const certLinks = certs.flatMap((c: any) => (c.files || []).map((fl: any) => ({ name: fl.label, url: fl.url, when: c.createdAt })));
  async function upload() {
    if (!file) return;
    const form = new FormData(); form.append("file", file); form.append("name", docName.trim() || file.name);
    setBusy(true);
    try { await api.upload(`/instructors/${instructorId}/documents`, form); setFile(null); setDocName(""); onChange(); } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function del(docId: string) { if (!(await confirm({ title: "Delete document?", message: "Delete this document?" }))) return; try { await api.del(`/instructors/${instructorId}/documents/${docId}`); onChange(); } catch (err: any) { toast.error(err.message); } }
  return (
    <div className="card p-6">
      <h2 className="mb-4 font-semibold">Documents</h2>
      {canEdit && (
        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="min-w-[160px] flex-1"><label className="label">Document name</label><input className="input" placeholder="e.g. Degree Certificate" value={docName} onChange={(e) => setDocName(e.target.value)} /></div>
          <div><label className="label">File (image or PDF)</label><input type="file" accept="image/*,application/pdf" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
          <button disabled={!file || busy} onClick={upload} className="btn btn-primary btn-sm disabled:opacity-50"><Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}</button>
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {documents.length ? documents.map((d: any) => (
          <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
            <FileText className="h-4 w-4 text-slate-400" />
            <div className="min-w-0 flex-1"><div className="truncate font-medium text-slate-700">{d.name}</div><div className="text-[11px] text-slate-400">{d.uploadedByName} · {new Date(d.createdAt).toLocaleString()}</div></div>
            {canEdit ? (
              <RowActionsMenu actions={[
                { label: "Download / open", icon: Download, href: `${API_BASE}/api/instructors/${instructorId}/documents/${d.id}`, newTab: true },
                { label: "Delete", icon: Trash2, danger: true, onClick: () => del(d.id) },
              ]} />
            ) : (
              <a href={`${API_BASE}/api/instructors/${instructorId}/documents/${d.id}`} target="_blank" rel="noreferrer" title="Download / open" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Download className="h-4 w-4" /></a>
            )}
          </li>
        )) : <li className="py-4 text-sm text-slate-400">No documents uploaded.</li>}
      </ul>

      {/* Certificates submitted via the public form → Google Drive links. */}
      {certLinks.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Certificates (public form)</h3>
          <ul className="divide-y divide-slate-100">
            {certLinks.map((c: any, i: number) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <FileText className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1"><div className="truncate font-medium text-slate-700">{c.name}</div><div className="text-[11px] text-slate-400">Submitted {new Date(c.when).toLocaleDateString()}</div></div>
                <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-brand-600 hover:bg-brand-50 hover:underline">View <Download className="h-3.5 w-3.5" /></a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AuditTab({ instructorId }: { instructorId: string }) {
  const [entries, setEntries] = useState<any[] | null>(null);
  useEffect(() => { api.get(`/instructors/${instructorId}/audit`).then((r) => setEntries(r.entries)).catch(() => setEntries([])); }, [instructorId]);
  if (!entries) return <div className="py-16" />;
  return (
    <div className="card p-6">
      <h2 className="mb-4 font-semibold">Audit trail</h2>
      {entries.length ? (
        <ul className="space-y-3">
          {entries.map((a) => (
            <li key={a.id} className="border-l-2 border-slate-100 pl-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="chip chip-gray">{a.action.replace(/_/g, " ").toLowerCase()}</span>
                {a.fieldName && <span className="font-medium">{a.fieldName}</span>}
                {(a.oldValue || a.newValue) && <span className="text-xs"><span className="text-slate-400 line-through">{a.oldValue || "—"}</span> → <span className="text-slate-700">{a.newValue || "—"}</span></span>}
                {a.proofPath && <a href={`${API_BASE}/api/audit/proof/${encodeURIComponent(a.proofPath)}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">view proof</a>}
              </div>
              {a.reason && <div className="text-xs text-slate-500">{a.reason}</div>}
              <div className="text-[11px] text-slate-400">{a.actorName} · {new Date(a.createdAt).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-400">No audit entries for this instructor.</p>}
    </div>
  );
}

// Lifecycle emails to the instructor — status of each + resend (honours the admin on/off toggles).
export function MailsTab({ instructorId, canSend }: { instructorId: string; canSend: boolean }) {
  const toast = useToast();
  const [mails, setMails] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  function load() { api.get(`/instructors/${instructorId}/mails`).then((r) => setMails(r.mails)).catch((e) => toast.error(e.message)); }
  useEffect(load, [instructorId]);
  async function send(kind: string) {
    setBusy(kind);
    try { const r = await api.post(`/instructors/${instructorId}/mails/${kind}/send`); toast.success(`Email ${r.status === "SENT" ? "sent" : r.status.toLowerCase()} to ${r.to || "instructor"}.`); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }
  if (!mails) return <div className="py-16" />;
  const badge = (status?: string) => {
    if (status === "SENT") return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Sent</span>;
    if (status === "FAILED") return <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600"><AlertCircle className="h-3.5 w-3.5" /> Failed</span>;
    if (status === "SKIPPED") return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><MinusCircle className="h-3.5 w-3.5" /> Turned off</span>;
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400"><MinusCircle className="h-3.5 w-3.5" /> Not sent</span>;
  };
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3"><Mail className="h-5 w-5 text-brand-600" /><h2 className="font-semibold text-slate-800">Mails</h2></div>
      <div className="divide-y divide-slate-100">
        {mails.map((m) => (
          <div key={m.kind} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">{m.label}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {badge(m.last?.status)}
                {m.last && <span className="text-[11px] text-slate-400">{m.last.status === "SENT" ? "to " + m.last.to + " · " : ""}{new Date(m.last.createdAt).toLocaleString()}{m.last.sentByName ? " · by " + m.last.sentByName : ""}</span>}
                {m.last?.error && <span className="text-[11px] text-rose-500">{m.last.error}</span>}
              </div>
            </div>
            {canSend && (
              <button onClick={() => send(m.kind)} disabled={busy === m.kind} className="btn btn-ghost btn-sm shrink-0 disabled:opacity-50" title={m.last ? "Resend" : "Send"}>
                {busy === m.kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {m.last ? "Resend" : "Send"}
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-400">These emails are controlled by the admin in Settings → Emails. A turned-off email won't send even on resend.</p>
    </div>
  );
}

export function HistoryTab({ instructorId }: { instructorId: string }) {
  const [h, setH] = useState<any>(null);
  useEffect(() => { api.get(`/instructors/${instructorId}/history`).then(setH).catch(() => {}); }, [instructorId]);
  if (!h) return <div className="py-16" />;
  const stat = (label: string, n: number) => <div className="card flex flex-col p-4"><span className="text-2xl font-bold">{n}</span><span className="text-xs text-slate-500">{label}</span></div>;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {stat("Manager changes", h.assignments?.length || 0)}
        {stat("Lifecycle events", h.lifecycle?.length || 0)}
        {stat("Field changes", h.fieldChanges?.length || 0)}
        {stat("Sign-ins", h.logins?.length || 0)}
      </div>
      <div className="card p-6"><h2 className="mb-3 font-semibold">Manager assignments</h2>
        <ul className="space-y-2 text-sm">{h.assignments.length ? h.assignments.map((a: any, i: number) => <li key={i} className="flex justify-between"><span className="text-slate-700">{a.manager}</span><span className="text-xs text-slate-400">{new Date(a.startedAt).toLocaleDateString()} → {a.endedAt ? new Date(a.endedAt).toLocaleDateString() : "present"}</span></li>) : <li className="text-slate-400">None.</li>}</ul>
      </div>
      {h.lifecycle?.length > 0 && (
        <div className="card p-6"><h2 className="mb-3 font-semibold">Lifecycle history</h2>
          <ul className="space-y-2 text-sm">{h.lifecycle.map((l: any, i: number) => <li key={i} className="flex justify-between"><span className="text-slate-700">{LIFECYCLE_LABEL[l.status] || l.status}{l.note ? ` — ${l.note}` : ""}</span><span className="text-xs text-slate-400">{l.actorName} · {new Date(l.createdAt).toLocaleString()}</span></li>)}</ul>
        </div>
      )}
      {h.fieldChanges?.length > 0 && (
        <div className="card p-6"><h2 className="mb-3 font-semibold">Field changes</h2>
          <ul className="space-y-2 text-sm">{h.fieldChanges.map((c: any, i: number) => <li key={i}><span className="font-medium">{c.fieldName}:</span> <span className="text-slate-400 line-through">{c.oldValue || "—"}</span> → <span className="text-slate-700">{c.newValue || "—"}</span> <span className="text-[11px] text-slate-400">· {c.actorName} · {new Date(c.createdAt).toLocaleString()}</span></li>)}</ul>
        </div>
      )}
      {h.logins?.length > 0 && (
        <div className="card p-6"><h2 className="mb-3 font-semibold">Recent logins</h2>
          <ul className="space-y-1 text-sm">{h.logins.map((l: any, i: number) => <li key={i} className="flex justify-between gap-3 text-slate-600"><span className="truncate">{l.method} · {l.ip || "—"}{l.userAgent ? ` · ${l.userAgent.slice(0, 40)}` : ""}</span><span className="shrink-0 text-xs text-slate-400">{new Date(l.at).toLocaleString()}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}
