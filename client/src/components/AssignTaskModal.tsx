import { useEffect, useRef, useState } from "react";
import {
  AlarmClock, Calendar, ChevronDown, Flag, Loader2, MoreHorizontal, Paperclip,
  Tag, X, ArrowLeft, Check,
} from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import { useDebouncedValue } from "../hooks";
import SearchableSelect from "./SearchableSelect";
import Modal from "./Modal";

const MODAL_W = 720;
const MODAL_H = 520;

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

const PRIORITY_ITEMS = [
  { value: "HIGH" as const, num: 1, color: "text-rose-500", pill: "border-rose-300 bg-rose-50 text-rose-700", flagFill: true },
  { value: "MEDIUM" as const, num: 2, color: "text-amber-500", pill: "border-amber-300 bg-amber-50 text-amber-700", flagFill: true },
  { value: "LOW" as const, num: 3, color: "text-sky-500", pill: "border-sky-300 bg-sky-50 text-sky-700", flagFill: true },
  { value: "LOW" as const, num: 4, color: "text-slate-300", pill: "border-slate-200 bg-white text-slate-600", flagFill: false },
];

const ROLE_NAMES: Record<string, string> = {
  SENIOR_MANAGER: "Senior Managers",
  CAPABILITY_MANAGER: "Capability Managers",
  INSTRUCTOR: "Instructors",
  OPS_ADMIN: "Ops Admins",
};

const DEFAULT_REMINDERS = [
  { value: 0, label: "No reminders" },
  { value: 3600000, label: "Every 1 hour" },
  { value: 18000000, label: "Every 5 hours" },
  { value: 86400000, label: "Every 1 day" },
];

// Auto-saved draft so a sudden close / tab-shut never loses typed text. Persisted on every change,
// restored on reopen, cleared on successful submit or explicit discard. (Attachment/File isn't saved.)
const DRAFT_KEY = "fo_task_draft_v1";
type TaskDraft = { title: string; description: string; dueAt: string; priority: "LOW" | "MEDIUM" | "HIGH"; priorityPick: number; reminderIntervalMs: number; labels: string[]; showDescription: boolean };
function loadTaskDraft(): Partial<TaskDraft> { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {}; } catch { return {}; } }
function clearTaskDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }

type Popover = "deadline" | "priority" | "reminders" | "more" | "labels" | null;
type Panel = "main" | "assign";

type AssignSummary =
  | { kind: "ROLE"; role: string; label: string; count: number }
  | { kind: "USER"; userId: string; name: string }
  | { kind: "INSTRUCTORS"; count: number; names: string[] }
  | null;

function fmtDateShort(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function PopoverCard({ title, children, footer, placement = "bottom" }: { title: string; children: React.ReactNode; footer?: React.ReactNode; placement?: "top" | "bottom" }) {
  const pos = placement === "top" ? "bottom-full mb-1" : "top-full mt-1";
  return (
    <div className={`absolute left-0 z-30 ${pos} w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg`} data-keep-open onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
      </div>
      {children}
      {footer && <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">{footer}</div>}
    </div>
  );
}

function ActionPill({ icon: Icon, label, active, activeClass, iconClassName, iconFill, onClick, onClear }: {
  icon?: any; label: string; active?: boolean; activeClass?: string; iconClassName?: string; iconFill?: boolean;
  onClick: () => void; onClear?: () => void;
}) {
  return (
    <button
      type="button"
      data-keep-open
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${active ? activeClass || "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClassName || ""}`} fill={iconFill === false ? "none" : iconFill ? "currentColor" : undefined} strokeWidth={iconFill === false ? 2 : undefined} />}
      <span className="max-w-[120px] truncate">{label}</span>
      {active && onClear && (
        <span role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onClear(); }} className="ml-0.5 rounded p-0.5 hover:bg-black/5">
          <X className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

export default function AssignTaskModal({ meta, onClose, onDone }: { meta: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const isOps = meta.isOps;
  const wrapRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const [panel, setPanel] = useState<Panel>("main");
  const [popover, setPopover] = useState<Popover>(null);
  // Restore any unsaved draft (read once on mount) so text survives an accidental close / tab shut.
  const draft0 = useRef(loadTaskDraft()).current;
  const [draftRestored, setDraftRestored] = useState(() => Boolean(draft0.title || draft0.description || (draft0.labels && draft0.labels.length) || draft0.dueAt));
  const [showDescription, setShowDescription] = useState(draft0.showDescription ?? true);

  const [title, setTitle] = useState(draft0.title || "");
  const [description, setDescription] = useState(draft0.description || "");
  const [dueAt, setDueAt] = useState(draft0.dueAt || "");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">(draft0.priority || "MEDIUM");
  const [priorityPick, setPriorityPick] = useState(draft0.priorityPick || 4);
  const [reminderIntervalMs, setReminderIntervalMs] = useState(draft0.reminderIntervalMs || 0);
  const [reminderTab, setReminderTab] = useState<"datetime" | "before">("before");
  const [labels, setLabels] = useState<string[]>(draft0.labels || []);
  const [labelDraft, setLabelDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [targetType, setTargetType] = useState<"USER" | "ROLE">("USER");
  const [role, setRole] = useState("CAPABILITY_MANAGER");
  const [userId, setUserId] = useState("");
  const [userOptions, setUserOptions] = useState<any[]>([]);
  const [instructorOptions, setInstructorOptions] = useState<any[]>([]);
  const [selectedInstructors, setSelectedInstructors] = useState<string[]>([]);
  const [assignSummary, setAssignSummary] = useState<AssignSummary>(null);

  const [userQ, setUserQ] = useState("");
  const userDq = useDebouncedValue(userQ, 300);
  const [userLoading, setUserLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reminderOptions = meta.reminderOptions?.length ? meta.reminderOptions : DEFAULT_REMINDERS;
  const loginInstructors = instructorOptions.filter((i) => i.hasLogin);
  const selectedPriority = PRIORITY_ITEMS.find((p) => p.num === priorityPick) || PRIORITY_ITEMS[3];

  useEffect(() => {
    if (isOps && panel === "assign" && targetType === "USER") {
      const q = new URLSearchParams();
      if (role) q.set("role", role);
      if (userDq.trim()) q.set("q", userDq.trim());
      setUserLoading(true);
      api.get(`/tasks/assign-options?${q}`).then((r) => setUserOptions(r.users || [])).catch(() => setUserOptions([])).finally(() => setUserLoading(false));
    }
  }, [isOps, panel, targetType, role, userDq]);

  useEffect(() => {
    if (!isOps) api.get("/tasks/assign-options").then((r) => setInstructorOptions(r.instructors || [])).catch(() => setInstructorOptions([]));
  }, [isOps]);

  useEffect(() => {
    resizeTextarea(titleRef.current);
  }, [title]);

  // Persist the draft on every change (and drop it once everything is empty) so closing the modal —
  // via Cancel, the ✕, Escape, or even shutting the tab — never loses the typed title/description.
  useEffect(() => {
    const empty = !title.trim() && !description.trim() && !dueAt && labels.length === 0 && reminderIntervalMs === 0;
    try {
      if (empty) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, dueAt, priority, priorityPick, reminderIntervalMs, labels, showDescription }));
    } catch { /* storage full / unavailable — ignore */ }
  }, [title, description, dueAt, priority, priorityPick, reminderIntervalMs, labels, showDescription]);

  function discardDraft() {
    setTitle(""); setDescription(""); setDueAt(""); setPriority("MEDIUM"); setPriorityPick(4);
    setReminderIntervalMs(0); setLabels([]); setShowDescription(true); setDraftRestored(false);
    clearTaskDraft();
  }

  function closePopoversUnlessKeep(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest("[data-keep-open]")) return;
    setPopover(null);
  }

  async function confirmAssign() {
    setErr(null);
    if (isOps) {
      if (targetType === "USER") {
        if (!userId) { setErr("Select a person."); return; }
        const u = userOptions.find((x) => x.id === userId);
        setAssignSummary({ kind: "USER", userId, name: u?.name || "Selected person" });
      } else {
        const q = new URLSearchParams(); q.set("role", role);
        const r = await api.get(`/tasks/assign-options?${q}`);
        const count = (r.users || []).length;
        setAssignSummary({ kind: "ROLE", role, label: ROLE_NAMES[role] || role, count });
      }
    } else {
      if (!selectedInstructors.length) { setErr("Select at least one instructor."); return; }
      const names = loginInstructors.filter((i) => selectedInstructors.includes(i.instructorId)).map((i) => i.name);
      setAssignSummary({ kind: "INSTRUCTORS", count: selectedInstructors.length, names: names.slice(0, 3) });
    }
    setPanel("main");
    setErr(null);
  }

  async function submit() {
    setErr(null);
    if (!title.trim()) { setErr("Enter a task title."); return; }
    if (!dueAt) { setErr("Set a deadline for this task."); return; }
    if (!assignSummary) { setErr("Choose who to assign this task to."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("body", description.trim() || title.trim());
      fd.append("dueAt", new Date(dueAt).toISOString());
      fd.append("priority", priority);
      fd.append("reminderIntervalMs", String(reminderIntervalMs));
      fd.append("labels", JSON.stringify(labels));
      if (attachment) fd.append("attachment", attachment);

      if (isOps && assignSummary.kind === "ROLE") {
        fd.append("targetType", "ROLE");
        fd.append("role", assignSummary.role);
      } else if (isOps && assignSummary.kind === "USER") {
        fd.append("targetType", "USER");
        fd.append("userId", assignSummary.userId);
      } else if (assignSummary.kind === "INSTRUCTORS") {
        selectedInstructors.forEach((id) => fd.append("instructorIds", id));
      }

      const r = await api.upload("/tasks", fd);
      toast.success(`Assigned ${r.count} task(s).`);
      clearTaskDraft();
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  function addLabel() {
    const t = labelDraft.trim();
    if (!t || labels.includes(t)) return;
    setLabels((p) => [...p, t].slice(0, 10));
    setLabelDraft("");
  }

  function pickPriority(num: number, value: "LOW" | "MEDIUM" | "HIGH") {
    setPriorityPick(num);
    setPriority(value);
    setPopover(null);
  }

  function onAttachmentPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setAttachment(f);
    if (f) toast.success(`Attached ${f.name}`);
  }

  const reminderLabel = reminderOptions.find((o: any) => o.value === reminderIntervalMs)?.label || "Reminders";

  return (
    <Modal
      title=""
      onClose={onClose}
      flush
      panelClassName="!w-[720px] !max-w-[720px]"
      panelStyle={{ height: MODAL_H, width: MODAL_W }}
    >
      <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf" onChange={onAttachmentPick} />

      <div ref={wrapRef} className="flex h-full flex-col" onMouseDown={closePopoversUnlessKeep}>
        {panel === "assign" ? (
          <>
            <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-4 pr-12">
              <button type="button" onClick={() => { setPanel("main"); setErr(null); setPopover(null); }} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-600">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <h3 className="mt-2 text-base font-semibold text-slate-900">Assign to</h3>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                {isOps ? (
                  <>
                    <div className="flex gap-2">
                      {(["USER", "ROLE"] as const).map((t) => (
                        <button key={t} type="button" onClick={() => {
                          setTargetType(t);
                          if (t === "USER" && role === "INSTRUCTOR") {
                            setRole("CAPABILITY_MANAGER");
                            setUserId("");
                            setUserQ("");
                          }
                        }} className={`rounded-lg px-4 py-2 text-sm font-medium ${targetType === t ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                          {t === "USER" ? "Specific person" : "All by role"}
                        </button>
                      ))}
                    </div>
                    {targetType === "ROLE" ? (
                      <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                        <option value="SENIOR_MANAGER">All Senior Managers</option>
                        <option value="CAPABILITY_MANAGER">All Capability Managers</option>
                        <option value="INSTRUCTOR">All Instructors</option>
                      </select>
                    ) : (
                      <div className="space-y-3">
                        <select className="input" value={role} onChange={(e) => { setRole(e.target.value); setUserId(""); setUserQ(""); }}>
                          <option value="SENIOR_MANAGER">Senior Manager</option>
                          <option value="CAPABILITY_MANAGER">Capability Manager</option>
                          <option value="OPS_ADMIN">Ops Admin</option>
                        </select>
                        <SearchableSelect
                          inline
                          hideHints
                          listMaxHeight={200}
                          value={userId}
                          onChange={setUserId}
                          query={userQ}
                          onQueryChange={setUserQ}
                          loading={userLoading}
                          placeholder="Search by name…"
                          options={userOptions.map((u) => ({ value: u.id, label: u.name }))}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <InstructorPicker options={loginInstructors} selected={selectedInstructors} onChange={setSelectedInstructors} />
                )}
                {err && <p className="text-sm text-rose-600">{err}</p>}
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <button type="button" onClick={() => { setPanel("main"); setErr(null); }} className="btn btn-ghost btn-sm">Cancel</button>
              <button type="button" onClick={confirmAssign} className="btn btn-primary btn-sm">Add</button>
            </div>
          </>
        ) : (
          <>
            {draftRestored && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <span>Draft restored from your last edit.</span>
                <button type="button" onClick={discardDraft} className="font-semibold text-amber-700 underline hover:text-amber-900">Discard</button>
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3 pt-4 pr-12">
              <div className="max-h-28 shrink-0 overflow-y-auto overscroll-contain">
                <textarea
                  ref={titleRef}
                  rows={1}
                  className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Task name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onInput={(e) => resizeTextarea(e.currentTarget)}
                  autoFocus
                />
              </div>
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                {showDescription ? (
                  <textarea
                    className="min-h-[280px] w-full flex-1 resize-none overflow-y-auto rounded-lg border border-transparent bg-slate-50/80 px-3 py-2.5 text-sm leading-relaxed text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-200 focus:bg-white"
                    placeholder="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                ) : (
                  <div className="min-h-[280px] flex-1 rounded-lg border border-dashed border-slate-100 bg-slate-50/40" />
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100">
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-2">
                  {labels.map((l) => <span key={l} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">{l}</span>)}
                </div>
              )}

              <div className="relative flex flex-wrap gap-2 px-4 py-3">
                <div className="relative" data-keep-open>
                  <ActionPill
                    icon={Calendar}
                    iconClassName="text-emerald-600"
                    label={dueAt ? fmtDateShort(dueAt) : "Deadline"}
                    active={!!dueAt}
                    activeClass="border-emerald-300 bg-emerald-50 text-emerald-700"
                    onClick={() => setPopover(popover === "deadline" ? null : "deadline")}
                    onClear={() => setDueAt("")}
                  />
                  {popover === "deadline" && (
                    <PopoverCard title="Deadline" placement="top">
                      <input type="datetime-local" className="input w-full" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                      <button type="button" className="btn btn-primary btn-sm mt-2 w-full" onClick={() => setPopover(null)}>Done</button>
                    </PopoverCard>
                  )}
                </div>

                <ActionPill
                  icon={Paperclip}
                  iconClassName="text-violet-600"
                  label={attachment ? attachment.name.slice(0, 18) : "Attachment"}
                  active={!!attachment}
                  activeClass="border-violet-300 bg-violet-50 text-violet-700"
                  onClick={() => fileRef.current?.click()}
                  onClear={() => { setAttachment(null); if (fileRef.current) fileRef.current.value = ""; }}
                />

                <div className="relative" data-keep-open>
                  <ActionPill
                    icon={Flag}
                    label={`Priority ${priorityPick}`}
                    active
                    activeClass={selectedPriority.pill}
                    iconClassName={selectedPriority.color}
                    iconFill={selectedPriority.flagFill}
                    onClick={() => setPopover(popover === "priority" ? null : "priority")}
                  />
                  {popover === "priority" && (
                    <PopoverCard title="Priority" placement="top">
                      <ul className="space-y-0.5">
                        {PRIORITY_ITEMS.map((p) => (
                          <li key={p.num}>
                            <button type="button" onClick={() => pickPriority(p.num, p.value)} className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50 ${priorityPick === p.num ? "bg-slate-50 font-medium" : ""}`}>
                              <span className="flex items-center gap-2">
                                <Flag className={`h-4 w-4 ${p.color}`} fill={p.flagFill ? "currentColor" : "none"} />
                                Priority {p.num}
                              </span>
                              {priorityPick === p.num && <Check className="h-4 w-4 text-brand-600" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </PopoverCard>
                  )}
                </div>

                <div className="relative" data-keep-open>
                  <ActionPill
                    icon={AlarmClock}
                    iconClassName={reminderIntervalMs ? "text-brand-600" : "text-amber-500"}
                    label={reminderIntervalMs ? reminderLabel : "Reminders"}
                    active={!!reminderIntervalMs}
                    activeClass="border-brand-300 bg-brand-50 text-brand-700"
                    onClick={() => setPopover(popover === "reminders" ? null : "reminders")}
                    onClear={() => setReminderIntervalMs(0)}
                  />
                  {popover === "reminders" && (
                    <PopoverCard
                      title="Reminders"
                      placement="top"
                      footer={
                        <button type="button" className="btn btn-primary btn-sm w-full" onClick={() => setPopover(null)}>
                          Add reminder
                        </button>
                      }
                    >
                      <div className="mb-3 flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
                        <button type="button" onClick={() => setReminderTab("datetime")} className={`flex-1 rounded-md px-2 py-1.5 ${reminderTab === "datetime" ? "border border-slate-900 bg-white shadow-sm" : "text-slate-500"}`}>Date & time</button>
                        <button type="button" onClick={() => setReminderTab("before")} className={`flex-1 rounded-md px-2 py-1.5 ${reminderTab === "before" ? "border border-slate-900 bg-white shadow-sm" : "text-slate-500"}`}>Before task</button>
                      </div>
                      {reminderTab === "datetime" ? (
                        <>
                          <p className="text-sm text-slate-700">At time of task</p>
                          <p className="mt-2 text-xs text-slate-500">Get a notification when it&apos;s time for this task.</p>
                        </>
                      ) : (
                        <ul className="space-y-0.5">
                          {reminderOptions.filter((o: { value: number }) => o.value > 0).map((opt: { value: number; label: string }) => (
                            <li key={opt.value}>
                              <button type="button" onClick={() => setReminderIntervalMs(opt.value)} className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50 ${reminderIntervalMs === opt.value ? "bg-brand-50 font-medium text-brand-700" : ""}`}>
                                {opt.label}
                                {reminderIntervalMs === opt.value && <Check className="h-4 w-4" />}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </PopoverCard>
                  )}
                </div>

                <div className="relative" data-keep-open>
                  <button type="button" data-keep-open onClick={() => setPopover(popover === "more" ? null : "more")} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {popover === "more" && (
                    <div className="absolute bottom-full left-0 z-30 mb-1 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg" data-keep-open onMouseDown={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => { setShowDescription((v) => !v); setPopover(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        Description {showDescription ? "(hide)" : "(show)"}
                      </button>
                      <button type="button" onClick={() => setPopover("labels")} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Tag className="h-3.5 w-3.5" /> Labels</button>
                    </div>
                  )}
                  {popover === "labels" && (
                    <PopoverCard title="Labels" placement="top">
                      <div className="flex flex-wrap gap-1.5">
                        {labels.map((l) => (
                          <span key={l} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            {l}
                            <button type="button" onClick={() => setLabels((p) => p.filter((x) => x !== l))}><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input className="input flex-1 text-sm" placeholder="Add label" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }} />
                        <button type="button" onClick={addLabel} className="btn btn-ghost btn-sm">Add</button>
                      </div>
                    </PopoverCard>
                  )}
                </div>
              </div>

              <div className="px-4 pb-2">
                <button type="button" onClick={() => { setPanel("assign"); setPopover(null); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Assign to
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {assignSummary && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {assignSummary.kind === "ROLE" && (
                      <>
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">{assignSummary.label}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{assignSummary.count}</span>
                      </>
                    )}
                    {assignSummary.kind === "USER" && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">{assignSummary.name}</span>
                    )}
                    {assignSummary.kind === "INSTRUCTORS" && (
                      <>
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">{assignSummary.count} instructor{assignSummary.count !== 1 ? "s" : ""}</span>
                        {assignSummary.names.map((n) => <span key={n} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{n}</span>)}
                      </>
                    )}
                  </div>
                )}
                {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
                <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
                <button type="button" disabled={busy} onClick={submit} className="btn btn-primary btn-sm disabled:opacity-50">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : "Add task"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function InstructorPicker({ options, selected, onChange }: { options: any[]; selected: string[]; onChange: (ids: string[]) => void }) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="max-h-[220px] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
      {options.length ? options.map((i) => (
        <label key={i.instructorId} className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50">
          <input type="checkbox" checked={selected.includes(i.instructorId)} onChange={() => toggle(i.instructorId)} />
          <span className="text-slate-800">{i.name}</span>
        </label>
      )) : (
        <p className="px-3 py-4 text-xs text-slate-400">No instructors available.</p>
      )}
    </div>
  );
}
