import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Pencil, Trash2, GitBranch, Upload, FileText, Download, Printer, Loader2, Mail, Send,
  CheckCircle2, AlertCircle, MinusCircle, ChevronDown, Award, MessageSquare, CalendarClock, User,
  Briefcase, Star, LogOut, StickyNote, Clock, Rocket, ScrollText, GaugeCircle, ClipboardCheck,
  GraduationCap, TrendingUp, ListChecks, FileAudio, Flag, Presentation, ExternalLink,
} from "lucide-react";
import { api, API_BASE } from "../api";
import { useAuth, LIFECYCLE_LABEL, lifecycleLabel } from "../auth";
import { useToast } from "../toast";
import { useConfirm, usePrompt } from "../confirm";
import Modal from "../components/Modal";
import { Skeleton } from "../components/Skeleton";
import ScrollSelect from "../components/ScrollSelect";
import RowActionsMenu from "../components/RowActionsMenu";
import { isHealthKey, healthChipClass, stripHealthEmoji } from "../trainingScore";
import { isAbort } from "../hooks";

// Health-status fields show no emoji — the colour conveys the state (green/amber/red/grey).
function HealthChip({ value }: { value: any }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${healthChipClass(value)}`}>{stripHealthEmoji(value)}</span>;
}

// Scaffold-first shell: the real back-link + profile-card / side-nav / content-card frame render
// instantly; the person's name, tabs and field values shimmer until /instructors/:id resolves.
function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <Link to="/app/instructors/master" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden /><span>All instructors</span></Link>
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
              <div key={i} className="grid grid-cols-1 items-center gap-x-6 gap-y-1 py-1 sm:grid-cols-[11rem_minmax(0,28rem)]"><Skeleton width="60%" height="14px" /><Skeleton width="80%" height="30px" borderRadius="8px" /></div>
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
const CELL_BASE = "rounded-lg border px-3 py-1.5 text-sm leading-5";
const CELL_EDIT = `${CELL_BASE} w-full max-w-lg border-slate-300 bg-white text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100`;
const CELL_VIEW = `${CELL_BASE} block w-full max-w-lg cursor-text border-transparent text-left text-slate-800 hover:border-slate-300 hover:bg-slate-50`;
const CELL_STATIC = `${CELL_BASE} border-transparent text-slate-800`;
const FIELD_ROW = "group grid grid-cols-1 items-start gap-x-6 gap-y-1 py-2.5 sm:grid-cols-[11rem_minmax(0,28rem)] sm:items-center";

// Per-section icons for the Details card layout.
const MODULE_ICON: Record<string, any> = { PERSONAL: User, HIRING: Briefcase, DEPLOYMENT: Rocket, LIFECYCLE: GitBranch };
const moduleIcon = (k: string) => MODULE_ICON[k] || FileText;

// A Details section rendered as a card with an icon header + collapse chevron (open by default,
// so everything shows at once — no sidebar). Used for the field-definition modules & lifecycle.
function DetailsSection({ icon: Icon, title, defaultOpen = true, children }: { icon: any; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card select-text p-5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-4 w-4" /></span>
        <span className="flex-1 font-semibold text-slate-800">{title}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
const EDIT_BTN = "shrink-0 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100";
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
  const [topTab, setTopTab] = useState<"details" | "teachos">("details"); // top-level Details / TeachOS tabs
  const [tab, setTab] = useState<string>("");
  const [editField, setEditField] = useState<any>(null);
  const [editKey, setEditKey] = useState<string | null>(null); // inline-edit: which field key
  const inlineRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // Ops/SM edit instructor detail fields directly; a Capability Manager must send changes to their
  // Senior Manager for approval (a change request with proof). Status/notes/skills stay editable for CMs.
  const canEdit = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER" || user!.role === "CAPABILITY_MANAGER";
  const canEditFields = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER";
  const canRequest = user!.role === "CAPABILITY_MANAGER"; // CM → approval workflow
  const canAudit = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER"; // per-instructor audit tab stays Ops/SM
  const isOps = user!.role === "OPS_ADMIN";

  function load() {
    return api.get(`/instructors/${id}`).then(setP).catch((e) => { if (!isAbort(e)) setErr(e.message); });
  }
  async function withdrawRequest(r: any) {
    if (!(await confirm({ title: "Delete request?", message: `Withdraw your pending request for "${r.fieldLabel}"? The value won't change and this can't be undone.`, confirmText: "Delete", danger: true }))) return;
    try { await api.del(`/requests/${r.id}`); toast.success("Request deleted."); load(); } catch (e: any) { toast.error(e.message || "Failed to delete"); }
  }
  // Ops/SM edit inline (direct, audited, no reason prompt); a Capability Manager opens the
  // request modal (their change needs SM approval with a reason).
  const startEdit = (f: any) => { if (canEditFields) setEditKey(f.key); else if (canRequest) setEditField(f); };
  useEffect(() => {
    setP(null);
    setErr(null);
    const ac = new AbortController();
    api.get(`/instructors/${id}`, { signal: ac.signal }).then(setP).catch((e) => { if (!isAbort(e)) setErr(e.message); });
    return () => ac.abort();
  }, [id]);

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
  // Details field-module sections (as cards), excluding Training Stats & Performance (removed per request —
  // Training has its own page + the TeachOS tab; Performance is superseded by TeachOS).
  const detailModules = moduleTabs.filter((k: string) => k !== "TRAINING" && k !== "PERFORMANCE");
  const tabs = [...moduleTabs, ...(p.skills?.list?.length || p.skills?.moduleStatus?.length ? ["SKILLS"] : []), "LIFECYCLE", ...(p.exit ? ["EXIT"] : []), "NOTES", ...(p.documents !== null ? ["DOCUMENTS"] : []), "HISTORY", ...(canEdit && !p.isStaff ? ["MAILS"] : []), ...(canAudit ? ["AUDIT"] : [])];
  const active = tab || tabs[0] || "LIFECYCLE";
  const inst = p.instructor || {};
  const label = (t: string) => modLabel[t] || ({ SKILLS: "Skills", LIFECYCLE: "Lifecycle & Status", EXIT: "Exit / Offboarding", NOTES: "Notes", DOCUMENTS: "Documents", HISTORY: "History", MAILS: "Mails", AUDIT: "Audit" } as any)[t] || t;
  // Fields with an open change request awaiting Senior-Manager approval.
  const pendingByKey: Record<string, any> = Object.fromEntries((p.pendingRequests || []).map((r: any) => [r.fieldKey, r]));

  return (
    <div className="space-y-5">
      <Link to="/app/instructors/master" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden /><span>All instructors</span></Link>

      {/* Clean header — no card box, thin divider underneath. */}
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-5 select-none">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700">{(inst.name || "?").charAt(0)}</div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{inst.name}</h1>
          <p className="text-sm text-slate-500"><span className="font-mono">{inst.employeeId}</span> · {inst.campus || "no campus"} · Manager: {inst.managerName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && inst.status === "EXITED" && <button onClick={rehire} className="btn btn-success btn-sm">Re-hire</button>}
          {isOps && <button onClick={remove} className="btn btn-danger btn-sm"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>

      {/* Top-level tabs: Details (full profile) · TeachOS (BigQuery performance metrics) */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["details", "teachos"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTopTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${topTab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t === "details" ? "Details" : "TeachOS"}
          </button>
        ))}
      </div>

      {topTab === "teachos" && <TeachosTab instructorId={id!} />}

      {topTab === "details" && (
      <div className="space-y-4">
        {/* Field-definition modules as icon cards — all shown (no sidebar). Training Stats & Performance removed. */}
        {detailModules.map((modKey: string) => (
          <DetailsSection key={modKey} icon={moduleIcon(modKey)} title={modLabel[modKey] || modKey}>
            <dl className="max-w-3xl divide-y divide-slate-100">
              {(p.byModule?.[modKey] || []).map((f: any) => (
                <div key={f.key} className={FIELD_ROW}>
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
                      <button onClick={() => startEdit(f)} title={canRequest ? "Request change" : "Edit"} aria-label={`Edit ${f.label}`} className={EDIT_BTN}><Pencil className="h-4 w-4 text-slate-400 hover:text-brand-600" /></button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </DetailsSection>
        ))}

        {/* Lifecycle timeline */}
        <DetailsSection icon={GitBranch} title="Lifecycle & Status">
          <ul className="space-y-3">
            {inst.lifecycle?.length ? inst.lifecycle.map((l: any, i: number) => (
              <li key={i} className="flex items-start gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" /><div><div className="text-sm font-medium">{lifecycleLabel(l.status)}</div>{l.note && <div className="text-xs text-slate-500">{l.note}</div>}<div className="text-[11px] text-slate-400">{l.actorName} · {new Date(l.createdAt).toLocaleString()}</div></div></li>
            )) : <li className="text-sm text-slate-400">No lifecycle events.</li>}
          </ul>
        </DetailsSection>

        {/* Supplementary sections (each renders its own card). Audit removed per request. */}
        {(p.skills?.list?.length || p.skills?.moduleStatus?.length) ? <SkillsTab skills={p.skills} instructorId={id!} canEdit={canEdit} onChange={load} /> : null}
        {p.exit && <ExitTab exit={p.exit} instructorId={id!} canEdit={canEdit} onChange={load} />}
        <NotesTab notes={inst.notes} instructorId={id!} canEdit={canEdit} onChange={load} />
        {p.documents !== null && <DocumentsTab documents={p.documents} instructorId={id!} employeeId={inst.employeeId} canEdit={canEdit} onChange={load} />}
        <HistoryTab instructorId={id!} />
        {canEdit && !p.isStaff && <MailsTab instructorId={id!} canSend={canEdit} />}
      </div>
      )}

      {editField && <EditFieldModal field={editField} instructorId={id!} mode={canEditFields ? "edit" : "request"} onClose={() => setEditField(null)} onDone={() => { setEditField(null); load(); }} />}
    </div>
  );
}

export function fmt(v: any) { if (v === true) return "Yes"; if (v === false) return "No"; return v; }

function Field({ label, value }: { label: string; value: any }) {
  return <div className={FIELD_ROW}><dt className="text-sm font-medium text-slate-600">{label}</dt><dd className={CELL_STATIC}>{value || EMPTY}</dd></div>;
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
          <dl className="max-w-3xl divide-y divide-slate-100"><Field label="Last working day" value={f.lastWorkingDay} /><Field label="Type of exit" value={f.typeOfExit} /><Field label="Reason" value={f.reason} /><Field label="Detailed reason" value={f.detailedReason} /></dl>
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

// Collapsible card section — hidden by default, click the header (chevron) to reveal its content.
export function CollapsibleSection({ title, count, defaultOpen = false, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card p-6">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left font-semibold text-slate-800">
        <span>{title}{typeof count === "number" ? <span className="ml-1.5 text-sm font-normal text-slate-400">({count})</span> : null}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function AuditTab({ instructorId }: { instructorId: string }) {
  const [entries, setEntries] = useState<any[] | null>(null);
  useEffect(() => { api.get(`/instructors/${instructorId}/audit`).then((r) => setEntries(r.entries)).catch(() => setEntries([])); }, [instructorId]);
  if (!entries) return <div className="py-16" />;
  return (
    <CollapsibleSection title="Audit trail" count={entries.length}>
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
    </CollapsibleSection>
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
          <ul className="space-y-2 text-sm">{h.lifecycle.map((l: any, i: number) => <li key={i} className="flex justify-between"><span className="text-slate-700">{lifecycleLabel(l.status)}{l.note ? ` — ${l.note}` : ""}</span><span className="text-xs text-slate-400">{l.actorName} · {new Date(l.createdAt).toLocaleString()}</span></li>)}</ul>
        </div>
      )}
      {h.fieldChanges?.length > 0 && (
        <CollapsibleSection title="Field changes" count={h.fieldChanges.length}>
          <ul className="space-y-2 text-sm">{h.fieldChanges.map((c: any, i: number) => <li key={i}><span className="font-medium">{c.fieldName}:</span> <span className="text-slate-400 line-through">{c.oldValue || "—"}</span> → <span className="text-slate-700">{c.newValue || "—"}</span> <span className="text-[11px] text-slate-400">· {c.actorName} · {new Date(c.createdAt).toLocaleString()}</span></li>)}</ul>
        </CollapsibleSection>
      )}
      {h.logins?.length > 0 && (
        <div className="card p-6"><h2 className="mb-3 font-semibold">Recent logins</h2>
          <ul className="space-y-1 text-sm">{h.logins.map((l: any, i: number) => <li key={i} className="flex justify-between gap-3 text-slate-600"><span className="truncate">{l.method} · {l.ip || "—"}{l.userAgent ? ` · ${l.userAgent.slice(0, 40)}` : ""}</span><span className="shrink-0 text-xs text-slate-400">{new Date(l.at).toLocaleString()}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

// TeachOS performance metrics — read live from BigQuery (instructor tables), matched by uid.
const teachosNum = (v: any, d = 1) => (v == null || v === "" || isNaN(Number(v)) ? "—" : Number(v).toFixed(d).replace(/\.?0+$/, ""));
const teachosInt = (v: any) => (v == null || isNaN(Number(v)) ? "—" : String(Math.round(Number(v))));
const teachosDate = (v: any) => { if (!v) return "—"; const d = new Date(v); return isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };

// Plain count/value tile.
function MetricTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
// Rating tile with a value / max and a progress bar (proper rating format).
function RatingTile({ label, value, max, decimals = 2, sub }: { label: string; value: number | null; max?: number; decimals?: number; sub?: string }) {
  const v = value == null || isNaN(Number(value)) ? null : Number(value);
  const pct = v != null && max ? Math.max(0, Math.min(100, (v / max) * 100)) : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-slate-900">{v == null ? "—" : v.toFixed(decimals).replace(/\.?0+$/, "")}</span>
        {max != null && v != null && <span className="text-xs text-slate-400">/ {max}</span>}
      </div>
      {pct != null && <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>}
      <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
function TeachosSection({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-4 w-4" /></span>{title}
      </h3>
      {children}
    </div>
  );
}
const grid4 = "grid gap-3 sm:grid-cols-2 lg:grid-cols-4";

export function TeachosTab({ instructorId }: { instructorId: string }) {
  const [m, setM] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    setM(null); setErr(null);
    api.get(`/instructors/${instructorId}/teachos`).then((r) => on && setM(r)).catch((e) => on && setErr(e.message || "Failed to load TeachOS metrics."));
    return () => { on = false; };
  }, [instructorId]);

  if (err) return <div className="card p-6 text-sm text-rose-600">{err}</div>;
  if (!m) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="card p-5"><Skeleton width="40%" height="16px" /><div className="mt-4 grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((__, j) => <Skeleton key={j} width="100%" height="72px" borderRadius="12px" />)}</div></div>)}</div>;
  if (!m.configured) return <div className="card p-8 text-center text-sm text-slate-500">TeachOS metrics require BigQuery to be configured on the server.</div>;
  if (!m.found) return <div className="card p-8 text-center text-sm text-slate-400">No TeachOS performance data found for this instructor{m.uid ? " (no BigQuery match by UID)" : " — this record has no UID to match against BigQuery"}.</div>;

  const sc = m.scorecard, fb = m.feedback, qa = m.qa, dm = m.demos, as = m.assessments, ss = m.sessionsSummary, ctx = m.context, se = m.sentiment;
  const st = m.sessionStats, tr = m.ownTraining, rd = m.readiness;
  const comments: any[] = m.comments || [], sessions: any[] = m.recentSessions || [], themes: any[] = m.feedbackThemes || [];
  const sTotal = se ? se.positive + se.negative + se.neutral : 0;
  const themeMax = themes.reduce((mx, t) => Math.max(mx, t.count), 0) || 1;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">TeachOS Performance</h2>
        {m.category && <span className="chip chip-status">{m.category}</span>}
      </div>

      {/* Context — role / category / manager / institute */}
      {ctx && (
        <div className="flex flex-wrap gap-2">
          {[["Role", ctx.role], ["Category", ctx.category], ["Manager", ctx.manager], ["Institute", ctx.institute]].filter(([, v]) => v).map(([k, v]) => (
            <span key={k as string} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
              <span className="text-slate-400">{k}:</span><span className="font-medium text-slate-700">{v as string}</span>
            </span>
          ))}
        </div>
      )}

      {/* Performance & Quality */}
      {(sc || qa) && (
        <TeachosSection icon={Award} title="Performance & Quality">
          <div className={grid4}>
            {sc && <RatingTile label="Overall Score" value={sc.overall} max={sc.max || undefined} decimals={1} sub={sc.max && sc.overall != null ? `${teachosNum((Number(sc.overall) / Number(sc.max)) * 100, 0)}%` : undefined} />}
            {sc && <RatingTile label="Lecture Session Score" value={sc.lecture} max={sc.max || undefined} decimals={1} />}
            {sc && <RatingTile label="Practice Session Score" value={sc.practice} max={sc.max || undefined} decimals={1} />}
            {qa && <RatingTile label="Avg QA Rating" value={qa.avgRating} max={10} sub={qa.sessions ? `${teachosInt(qa.sessions)} evaluations` : undefined} />}
            {qa && qa.live != null && <RatingTile label="Live Sessions QA" value={qa.live} max={10} sub={[qa.mock != null ? `mock ${teachosNum(qa.mock, 1)}` : "", qa.demo != null ? `demo ${teachosNum(qa.demo, 1)}` : ""].filter(Boolean).join(" · ") || undefined} />}
          </div>
        </TeachosSection>
      )}

      {/* Student ratings (1–5 scale) */}
      {fb && (fb.studentScore != null || fb.teachingQuality != null) && (
        <TeachosSection icon={Star} title="Student Ratings">
          <div className={grid4}>
            {fb.studentScore != null && <RatingTile label="Student Feedback Score" value={fb.studentScore} max={5} />}
            {fb.teachingQuality != null && <RatingTile label="Teaching Quality" value={fb.teachingQuality} max={5} />}
            {fb.guidanceClarity != null && <RatingTile label="Guidance Clarity" value={fb.guidanceClarity} max={5} />}
            {fb.understanding != null && <RatingTile label="Understanding" value={fb.understanding} max={5} />}
          </div>
        </TeachosSection>
      )}

      {/* Session Activity */}
      {(st || (fb && (fb.lectureSessions != null || fb.practiceSessions != null)) || m.upcomingSessions != null) && (
        <TeachosSection icon={GaugeCircle} title="Session Activity">
          <div className={grid4}>
            {st && <MetricTile label="Sessions Completed" value={`${teachosInt(st.completed)} / ${teachosInt(st.total)}`} sub={pct(st.completed, st.total)} />}
            {st && st.flagTotal > 0 && <MetricTile label="Flagged Sessions" value={teachosInt(st.flagged)} sub={`${pct(st.flagged, st.flagTotal)} of ${teachosInt(st.flagTotal)}`} />}
            {fb && fb.lectureSessions != null && <MetricTile label="Total Lecture Sessions" value={teachosInt(fb.lectureSessions)} />}
            {fb && fb.practiceSessions != null && <MetricTile label="Total Practice Sessions" value={teachosInt(fb.practiceSessions)} />}
            {st && (st.offline > 0 || st.online > 0) && <MetricTile label="Offline / Online" value={`${teachosInt(st.offline)} / ${teachosInt(st.online)}`} />}
            {m.upcomingSessions != null && m.upcomingSessions > 0 && <MetricTile label="Upcoming Sessions" value={teachosInt(m.upcomingSessions)} />}
          </div>
        </TeachosSection>
      )}

      {/* Instructor Development — own training + self-assessment + readiness */}
      {(tr || as || rd) && (
        <TeachosSection icon={GraduationCap} title="Instructor Development">
          <div className={grid4}>
            {tr && tr.completionPct != null && <RatingTile label="Own Course Completion" value={tr.completionPct} max={100} decimals={0} sub={tr.unitsTotal ? `${teachosInt(tr.unitsDone)}/${teachosInt(tr.unitsTotal)} units` : "%"} />}
            {as && as.examScore != null && <RatingTile label="Practice Exam Score" value={as.examScore} max={100} decimals={0} sub={as.examAttempts ? `${teachosInt(as.examAttempts)} attempts` : "%"} />}
            {as && as.codingScore != null && <RatingTile label="Coding Assessment" value={as.codingScore} max={100} decimals={0} sub="%" />}
            {as && as.mcqScore != null && <RatingTile label="MCQ Assessment" value={as.mcqScore} max={100} decimals={0} sub="%" />}
            {rd && <MetricTile label="Pre-lecture Readiness" value={teachosInt(rd.sessions)} sub={rd.avgItems != null ? `avg ${teachosNum(rd.avgItems, 1)} checks/session` : undefined} />}
          </div>
        </TeachosSection>
      )}

      {/* Demos & Grooming */}
      {(dm || ss) && (
        <TeachosSection icon={Presentation} title="Demos & Grooming">
          <div className={grid4}>
            {dm && <MetricTile label="Demos (taken / scheduled)" value={`${teachosInt(dm.taken)} / ${teachosInt(dm.scheduled)}`} sub={dm.pending != null ? `${teachosInt(dm.pending)} pending` : undefined} />}
            {dm && dm.avgRating != null && <RatingTile label="Avg Demo QA Rating" value={dm.avgRating} max={10} />}
            {ss && ss.grooming != null && <RatingTile label="Grooming Score" value={ss.grooming} max={5} />}
            {ss && ss.performance != null && <RatingTile label="Performance Rating" value={ss.performance} max={5} />}
          </div>
        </TeachosSection>
      )}

      {/* Feedback themes — what students raise most */}
      {themes.length > 0 && (
        <TeachosSection icon={ListChecks} title="Feedback Themes">
          <ul className="space-y-2">
            {themes.map((t, i) => {
              const neg = /issue|dissatisf|improve|pace|clarity|complain/i.test(t.category);
              const pos = /appreci|good|positive/i.test(t.category);
              return (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate capitalize text-slate-700" title={t.category}>{t.category}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full rounded-full ${neg ? "bg-rose-400" : pos ? "bg-emerald-400" : "bg-slate-300"}`} style={{ width: `${(t.count / themeMax) * 100}%` }} />
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-slate-500">{t.count}</span>
                </li>
              );
            })}
          </ul>
        </TeachosSection>
      )}

      {/* Student Feedback — sentiment + real comments */}
      {(se || comments.length > 0) && (
        <TeachosSection icon={MessageSquare} title="Student Feedback">
          {se && sTotal > 0 && (
            <div className="mb-4">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="bg-emerald-500" style={{ width: `${(se.positive / sTotal) * 100}%` }} title={`Positive ${se.positive}`} />
                <div className="bg-slate-300" style={{ width: `${(se.neutral / sTotal) * 100}%` }} title={`Neutral ${se.neutral}`} />
                <div className="bg-rose-500" style={{ width: `${(se.negative / sTotal) * 100}%` }} title={`Negative ${se.negative}`} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="text-emerald-700">● {se.positive} positive</span>
                <span className="text-slate-500">● {se.neutral} neutral</span>
                <span className="text-rose-600">● {se.negative} negative</span>
                <span className="text-slate-400">of {sTotal} comments</span>
              </div>
            </div>
          )}
          {comments.length > 0 && (
            <ul className="space-y-2">
              {comments.map((c, i) => {
                const tone = /pos|appreci/i.test(c.sentiment || c.category || "") ? "border-emerald-200 bg-emerald-50/50" : /neg/i.test(c.sentiment || "") ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-slate-50/50";
                return (
                  <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
                    <span className="text-slate-700">"{c.text}"</span>
                    {c.session && <span className="mt-0.5 block text-[11px] text-slate-400">{c.session}{c.category ? ` · ${c.category}` : ""}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </TeachosSection>
      )}

      {/* Recent sessions + QA report / recording / transcript links + grooming remark */}
      {sessions.length > 0 && (
        <TeachosSection icon={CalendarClock} title="Recent Sessions">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Session</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Teaching Q.</th><th className="px-3 py-2">QA</th><th className="px-3 py-2">Links</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="max-w-[220px] py-2 pr-3">
                      <div className="truncate font-medium text-slate-800" title={s.title}>{s.title}</div>
                      {s.groomingRemark && <div className="mt-0.5 truncate text-[11px] text-slate-400" title={s.groomingRemark}>{s.groomingRemark}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{s.type || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{teachosDate(s.date)}</td>
                    <td className="px-3 py-2"><span className="chip chip-gray">{(s.status || "—").toLowerCase()}</span></td>
                    <td className="px-3 py-2 text-slate-700">{teachosNum(s.teachingQuality, 2)}</td>
                    <td className="px-3 py-2 text-slate-700">{teachosNum(s.qaRating, 2)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex items-center gap-2">
                        {s.reportUrl && <a href={s.reportUrl} target="_blank" rel="noreferrer" title="QA report" className="text-slate-400 hover:text-brand-600"><ScrollText className="h-4 w-4" /></a>}
                        {s.audioUrl && <a href={s.audioUrl} target="_blank" rel="noreferrer" title="Recording" className="text-slate-400 hover:text-brand-600"><FileAudio className="h-4 w-4" /></a>}
                        {s.transcriptUrl && <a href={s.transcriptUrl} target="_blank" rel="noreferrer" title="Transcript" className="text-slate-400 hover:text-brand-600"><FileText className="h-4 w-4" /></a>}
                        {!s.reportUrl && !s.audioUrl && !s.transcriptUrl && <span className="text-slate-300">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TeachosSection>
      )}

      <p className="text-[11px] text-slate-400">Read live from BigQuery (TeachOS instructor tables), matched by UID · cached ~10 min · read-only.</p>
    </div>
  );
}
