import { useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2, RefreshCw, Printer, ExternalLink, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { api } from "../api";
import { useAuth, LIFECYCLE_LABEL } from "../auth";
import { useToast } from "../toast";
import { useConfirm, usePrompt } from "../confirm";
import { useBatchEdit } from "../batchEdit";
import { FormSkeleton } from "./skeletons";
import ScrollSelect from "./ScrollSelect";
import {
  fmt, EditFieldModal, StatusModal, SkillsTab, ExitTab, NotesTab,
  DocumentsTab, AuditTab, MailsTab, HistoryTab,
} from "../pages/InstructorProfilePage";

const VIS_CHIP: Record<string, string> = { PUBLIC: "chip-public", NECESSARY: "chip-necessary", SENSITIVE: "chip-sensitive" };
const CELL_BASE = "w-full rounded-lg border px-3 py-1.5 text-sm leading-5";
const CELL_EDIT = `${CELL_BASE} border-slate-300 bg-white text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100`;
const CELL_VIEW = `${CELL_BASE} block cursor-text border-transparent text-left text-slate-800 hover:border-slate-300 hover:bg-slate-50`;
const CELL_STATIC = `${CELL_BASE} border-transparent text-slate-800`;
const EMPTY = <span className="text-slate-400">—</span>;

/**
 * Full-height right-side drawer that shows the complete instructor profile as
 * STACKED SECTIONS (not a tabbed menu). Clicking a name/ID in the Instructor
 * Master opens this instead of navigating to the standalone profile page.
 *
 * It reuses the exact same `/instructors/:id` payload and the same section
 * components as InstructorProfilePage, so editing behaviour/permissions match.
 */
export default function InstructorDetailDrawer({ instructorId, onClose, onChanged, onNavigate }: { instructorId: string; onClose: () => void; onChanged?: () => void; onNavigate?: (id: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const batch = useBatchEdit();
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editField, setEditField] = useState<any>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [active, setActive] = useState<string>("");
  const inlineRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // In batch-edit mode, CM/SM may edit ANY field freely (buffered, no per-field request modal).
  const batchMode = batch.active;
  const baseCanEditFields = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER";
  const canEditFields = baseCanEditFields || batchMode; // free inline edit in batch mode
  const canRequest = user!.role === "CAPABILITY_MANAGER" && !batchMode; // per-field request only OUTSIDE batch mode
  const canEdit = canEditFields || canRequest;
  const canAudit = user!.role === "OPS_ADMIN" || user!.role === "SENIOR_MANAGER";
  const isOps = user!.role === "OPS_ADMIN";

  // Navigation across the instructors selected for this batch.
  const navIds = batchMode ? batch.scopedIds : [];
  const navIdx = navIds.indexOf(instructorId);

  function load() { api.get(`/instructors/${instructorId}`).then(setP).catch((e) => setErr(e.message)); }
  function reload() { load(); onChanged?.(); }
  useEffect(() => { setP(null); setErr(null); load(); /* eslint-disable-next-line */ }, [instructorId]);

  // Close on Escape; lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  useEffect(() => { if (editKey && inlineRef.current) { try { (inlineRef.current as any).showPicker?.(); } catch { /* unsupported */ } } }, [editKey]);

  function patchFieldValue(key: string, val: any) {
    setP((prev: any) => prev ? { ...prev, byModule: Object.fromEntries(Object.entries(prev.byModule).map(([m, arr]: any) => [m, arr.map((f: any) => f.key === key ? { ...f, value: val } : f)])) } : prev);
  }
  async function saveInline(f: any, raw: any) {
    const next = f.type === "BOOLEAN" ? (raw === true || raw === "true") : raw;
    setEditKey(null);
    // BATCH MODE: buffer the edit instead of persisting. `f.value` holds the ORIGINAL server value
    // (we don't mutate p in batch mode), so reverting to it drops the buffered change.
    if (batchMode) {
      batch.setEdit({
        instructorId, instructorName: p?.instructor?.name || "",
        fieldKey: f.key, fieldLabel: f.label,
        oldValue: String(f.value ?? ""), newValue: String(next ?? ""),
      });
      return;
    }
    if (String(f.value ?? "") === String(next ?? "")) return;
    const prev = f.value;
    patchFieldValue(f.key, next);
    try { await api.post(`/fields/value`, { instructorId, fieldKey: f.key, fieldLabel: f.label, oldValue: String(prev ?? ""), newValue: String(next), reason: "Inline edit" }); onChanged?.(); }
    catch (e: any) { toast.error(e.message || "Save failed — reverted"); patchFieldValue(f.key, prev); }
  }
  const startEdit = (f: any) => { if (canEditFields) setEditKey(f.key); else if (canRequest) setEditField(f); };

  async function remove() {
    if (!(await confirm({ title: "Delete instructor?", message: `Delete ${p.instructor.name}? This cannot be undone.` }))) return;
    try { await api.del(`/instructors/${instructorId}`); toast.success("Instructor deleted."); onChanged?.(); onClose(); } catch (e: any) { toast.error(e.message); }
  }
  async function rehire() {
    const note = await prompt({ title: "Re-hire instructor", message: "Add an optional note for the lifecycle record:", placeholder: "Optional note…", confirmText: "Re-hire", multiline: true });
    if (note === null) return;
    try { await api.post(`/instructors/${instructorId}/rehire`, { note }); toast.success("Re-hired."); reload(); } catch (e: any) { toast.error(e.message); }
  }
  async function withdrawRequest(r: any) {
    if (!(await confirm({ title: "Delete request?", message: `Withdraw your pending request for "${r.fieldLabel}"? The value won't change and this can't be undone.`, confirmText: "Delete", danger: true }))) return;
    try { await api.del(`/requests/${r.id}`); toast.success("Request deleted."); reload(); } catch (e: any) { toast.error(e.message || "Failed to delete"); }
  }

  function scrollTo(key: string) {
    const el = sectionRefs.current[key];
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
    setActive(key);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside className="relative flex h-full w-full min-w-[420px] max-w-[100vw] flex-col bg-slate-50 shadow-2xl md:w-[45%]">
        {err ? (
          <>
            <DrawerHeader onClose={onClose} title="Instructor" subtitle="" right={null} />
            <div className="flex-1 p-6"><div className="card p-6 text-sm text-rose-600">{err}</div></div>
          </>
        ) : !p ? (
          <>
            <DrawerHeader onClose={onClose} title="Instructor" subtitle="" right={null} />
            <div className="flex-1 overflow-y-auto p-6"><FormSkeleton sections={2} rows={4} /></div>
          </>
        ) : (
          <DrawerBody
            p={p} instructorId={instructorId} user={user} isOps={isOps} canEdit={canEdit}
            canEditFields={canEditFields} canRequest={canRequest} canAudit={canAudit}
            editKey={editKey} setEditKey={setEditKey} inlineRef={inlineRef} saveInline={saveInline} startEdit={startEdit}
            withdrawRequest={withdrawRequest} setStatusOpen={setStatusOpen} rehire={rehire} remove={remove}
            onClose={onClose} reload={reload} scrollRef={scrollRef} sectionRefs={sectionRefs} active={active} scrollTo={scrollTo}
            batchMode={batchMode} batch={batch} navIds={navIds} navIdx={navIdx} onNavigate={onNavigate}
          />
        )}

        {editField && <EditFieldModal field={editField} instructorId={instructorId} mode={canEditFields ? "edit" : "request"} onClose={() => setEditField(null)} onDone={() => { setEditField(null); reload(); }} />}
        {statusOpen && p && <StatusModal current={p.instructor?.status} instructorId={instructorId} onClose={() => setStatusOpen(false)} onDone={() => { setStatusOpen(false); reload(); }} />}
      </aside>
    </div>
  );
}

function DrawerHeader({ title, subtitle, right, onClose }: { title: string; subtitle: string; right: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="truncate text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Close"><X className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

function DrawerBody({ p, instructorId, user, isOps, canEdit, canEditFields, canRequest, canAudit, editKey, setEditKey, inlineRef, saveInline, startEdit, withdrawRequest, setStatusOpen, rehire, remove, onClose, reload, scrollRef, sectionRefs, active, scrollTo, batchMode, batch, navIds, navIdx, onNavigate }: any) {
  const inst = p.instructor || {};
  // Buffered (unsaved) edit for a field in batch mode, if any.
  const buffered = (key: string) => (batchMode ? batch.getEdit(instructorId, key) : undefined);
  const modLabel: Record<string, string> = Object.fromEntries((p.modules || []).map((m: any) => [m.key, m.label]));
  const moduleSections = (p.modules || []).map((m: any) => m.key).filter((k: string) => k !== "LIFECYCLE" && k !== "EXIT" && p.byModule?.[k]?.length);
  const sections: string[] = [
    ...moduleSections,
    ...(p.skills?.list?.length || p.skills?.moduleStatus?.length ? ["SKILLS"] : []),
    "LIFECYCLE",
    ...(p.exit ? ["EXIT"] : []),
    "NOTES",
    ...(p.documents !== null ? ["DOCUMENTS"] : []),
    "HISTORY",
    ...(canEdit && !p.isStaff ? ["MAILS"] : []),
    ...(canAudit ? ["AUDIT"] : []),
  ];
  const label = (t: string) => modLabel[t] || ({ SKILLS: "Skills", LIFECYCLE: "Lifecycle & Status", EXIT: "Exit / Offboarding", NOTES: "Notes", DOCUMENTS: "Documents", HISTORY: "History", MAILS: "Mails", AUDIT: "Audit" } as any)[t] || t;
  const pendingByKey: Record<string, any> = Object.fromEntries((p.pendingRequests || []).map((r: any) => [r.fieldKey, r]));
  const setRef = (key: string) => (el: HTMLElement | null) => { sectionRefs.current[key] = el; };

  return (
    <>
      <DrawerHeader
        onClose={onClose}
        title={inst.name}
        subtitle={`${inst.employeeId || ""}${inst.campus ? " · " + inst.campus : ""}${inst.managerName ? " · Manager: " + inst.managerName : ""}`}
        right={
          <>
            {/* Batch navigation across the selected instructors. */}
            {batchMode && navIds.length > 1 && (
              <div className="mr-1 flex items-center gap-1">
                <button onClick={() => onNavigate?.(navIds[(navIdx - 1 + navIds.length) % navIds.length])} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Previous selected"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-xs font-medium text-slate-500">{navIdx + 1}/{navIds.length}</span>
                <button onClick={() => onNavigate?.(navIds[(navIdx + 1) % navIds.length])} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Next selected"><ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
            <span className="chip chip-status text-xs">{LIFECYCLE_LABEL[inst.status] || inst.status}</span>
            {!batchMode && <a href={`/print/instructors/${instructorId}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Report card"><Printer className="h-4 w-4" /></a>}
            {!batchMode && <a href={`/app/instructors/${instructorId}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Open full page"><ExternalLink className="h-4 w-4" /></a>}
            {canEdit && !batchMode && <button onClick={() => setStatusOpen(true)} className="btn btn-ghost btn-sm" title="Change status"><RefreshCw className="h-4 w-4" /></button>}
            {canEdit && !batchMode && inst.status === "EXITED" && <button onClick={rehire} className="btn btn-success btn-sm">Re-hire</button>}
            {isOps && !batchMode && <button onClick={remove} className="btn btn-danger btn-sm" title="Delete"><Trash2 className="h-4 w-4" /></button>}
          </>
        }
      />

      {/* Batch-mode banner */}
      {batchMode && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs font-medium text-amber-700">
          <Layers className="h-3.5 w-3.5" />
          Batch edit mode — click any field to edit it. Changes are buffered and submitted together from the bar below.
          {batch.count > 0 && <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-amber-800">{batch.count} change(s) buffered</span>}
        </div>
      )}

      {/* Section jump-bar (anchors, not separate menus — every section lives on this one page). */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-white px-6 py-2.5">
        {sections.map((s) => (
          <button key={s} onClick={() => scrollTo(s)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${active === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label(s)}</button>
        ))}
      </div>

      {/* All sections stacked vertically in one scroll area. */}
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {moduleSections.map((m: string) => (
          <section key={m} ref={setRef(m)} className="card p-6">
            <h3 className="mb-4 font-semibold text-slate-800">{label(m)}</h3>
            <dl className="divide-y divide-slate-100">
              {(p.byModule?.[m] || []).map((f: any) => {
                const buf = buffered(f.key);
                // In batch mode the displayed value reflects the buffered edit (if any).
                const shown = buf ? buf.newValue : f.value;
                return (
                <div key={f.key} className="group grid grid-cols-[140px_1fr_auto] items-center gap-3 py-2">
                  <dt className="text-sm font-medium text-slate-600">{f.label}{buf && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">edited</span>}</dt>
                  <dd className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {pendingByKey[f.key] && !batchMode ? (
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
                          <ScrollSelect autoOpen value={String(shown ?? "")} options={[{ value: "", label: "— select —" }, ...(f.options || []).map((o: string) => ({ value: o, label: o }))]} onChange={(v) => saveInline(f, v)} onClose={() => setEditKey(null)} className={`${CELL_EDIT} flex items-center justify-between gap-2`} />
                        ) : f.type === "BOOLEAN" ? (
                          <select autoFocus ref={inlineRef as any} defaultValue={String(shown ?? "false")} onBlur={() => setEditKey(null)} onChange={(e) => saveInline(f, e.target.value)} className={CELL_EDIT}><option value="false">No</option><option value="true">Yes</option></select>
                        ) : (
                          <input autoFocus ref={inlineRef as any} type={f.type === "NUMBER" ? "number" : "text"} defaultValue={String(shown ?? "")} min={f.min ?? undefined} max={f.max ?? undefined} pattern={f.pattern || undefined} onBlur={(e) => saveInline(f, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditKey(null); }} className={CELL_EDIT} />
                        )
                      ) : ((canEditFields || canRequest) && f.type !== "FILE" && !f.computed) ? (
                        <button onClick={() => startEdit(f)} title={canRequest ? "Click to request change" : "Click to edit"} className={`${CELL_VIEW} ${buf ? "bg-amber-50 ring-1 ring-amber-200" : ""}`}>{fmt(shown) || EMPTY}</button>
                      ) : (
                        <div className={CELL_STATIC}>{fmt(shown) || EMPTY}</div>
                      )}
                    </div>
                    {!pendingByKey[f.key] && (canEditFields || canRequest) && f.type !== "FILE" && !f.computed && (
                      <button onClick={() => startEdit(f)} title={canRequest ? "Request change" : "Edit"} aria-label={`Edit ${f.label}`} className="shrink-0 opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100"><Pencil className="h-4 w-4 text-slate-400 hover:text-brand-600" /></button>
                    )}
                  </dd>
                  <span className={`chip ${VIS_CHIP[f.visibility] || "chip-gray"} justify-self-end text-[10px]`}>{(f.visibility || "").toLowerCase()}</span>
                </div>
                );
              })}
            </dl>
          </section>
        ))}

        {sections.includes("SKILLS") && <div ref={setRef("SKILLS")}><SkillsTab skills={p.skills} instructorId={instructorId} canEdit={canEdit} onChange={reload} /></div>}

        <section ref={setRef("LIFECYCLE")} className="card p-6">
          <h3 className="mb-4 font-semibold text-slate-800">Lifecycle & Status</h3>
          <ul className="space-y-3">
            {inst.lifecycle?.length ? inst.lifecycle.map((l: any, i: number) => (
              <li key={i} className="flex items-start gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" /><div><div className="text-sm font-medium">{LIFECYCLE_LABEL[l.status] || l.status}</div>{l.note && <div className="text-xs text-slate-500">{l.note}</div>}<div className="text-[11px] text-slate-400">{l.actorName} · {new Date(l.createdAt).toLocaleString()}</div></div></li>
            )) : <li className="text-sm text-slate-400">No lifecycle events.</li>}
          </ul>
        </section>

        {sections.includes("EXIT") && p.exit && <div ref={setRef("EXIT")}><ExitTab exit={p.exit} instructorId={instructorId} canEdit={canEdit} onChange={reload} /></div>}
        <div ref={setRef("NOTES")}><NotesTab notes={inst.notes} instructorId={instructorId} canEdit={canEdit} onChange={reload} /></div>
        {sections.includes("DOCUMENTS") && p.documents !== null && <div ref={setRef("DOCUMENTS")}><DocumentsTab documents={p.documents} instructorId={instructorId} employeeId={inst.employeeId} canEdit={canEdit} onChange={reload} /></div>}
        <div ref={setRef("HISTORY")}><HistoryTab instructorId={instructorId} /></div>
        {sections.includes("MAILS") && <div ref={setRef("MAILS")}><MailsTab instructorId={instructorId} canSend={canEdit} /></div>}
        {sections.includes("AUDIT") && <div ref={setRef("AUDIT")}><AuditTab instructorId={instructorId} /></div>}
      </div>
    </>
  );
}
