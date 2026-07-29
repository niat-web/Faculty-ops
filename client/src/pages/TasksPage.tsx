import { useEffect, useMemo, useState } from "react";
import { Check, CheckSquare, Loader2, Plus, Trash2, Calendar, User } from "lucide-react";
import { api } from "../api";
import { useAuth, ROLE_LABEL } from "../auth";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Modal from "../components/Modal";
import ScrollSelect from "../components/ScrollSelect";
import { Skeleton } from "../components/Skeleton";

const STATUS_CHIP: Record<string, string> = { OPEN: "chip-necessary", DONE: "chip-public", CANCELLED: "chip-gray" };

function fmtDue(d: string) {
  const dt = new Date(d);
  return dt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isOverdue(d: string, status: string) {
  return status === "OPEN" && new Date(d).getTime() < Date.now();
}

export default function TasksPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [meta, setMeta] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"mine" | "assigned" | "all">("mine");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);

  function load() {
    const q = new URLSearchParams();
    q.set("view", view);
    if (statusFilter) q.set("status", statusFilter);
    return api.get(`/tasks?${q}`).then((r) => setTasks(r.tasks || [])).catch((e) => toast.error(e.message));
  }

  useEffect(() => {
    api.get("/tasks/meta").then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [view, statusFilter]);

  const openCount = useMemo(() => tasks.filter((t) => t.status === "OPEN").length, [tasks]);

  async function markDone(t: any) {
    try {
      await api.patch(`/tasks/${t.id}`, { status: "DONE" });
      toast.success("Task marked done.");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function del(t: any) {
    if (!(await confirm({ title: "Delete task?", message: `Delete "${t.title}"? This can't be undone.`, confirmText: "Delete", danger: true }))) return;
    try {
      await api.del(`/tasks/${t.id}`);
      toast.success("Task deleted.");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  const canAssign = meta?.canAssign;
  const isOps = meta?.isOps;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CheckSquare className="h-7 w-7 text-brand-600" /> Tasks</h1>
          <p className="text-sm text-slate-500">
            {canAssign ? "Assign work to your team and track completion." : "Tasks assigned to you appear here."}
          </p>
        </div>
        {canAssign && (
          <button onClick={() => setAssignOpen(true)} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Assign task</button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setView("mine")} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === "mine" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          My tasks{view === "mine" && openCount > 0 ? ` (${openCount} open)` : ""}
        </button>
        {canAssign && (
          <button onClick={() => setView("assigned")} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === "assigned" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            Assigned by me
          </button>
        )}
        {isOps && (
          <button onClick={() => setView("all")} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === "all" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            All tasks
          </button>
        )}
        <span className="mx-1 text-slate-300">|</span>
        {["", "OPEN", "DONE", "CANCELLED"].map((s) => (
          <button key={s || "all"} onClick={() => setStatusFilter(s)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusFilter === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {s ? s.toLowerCase() : "All statuses"}
          </button>
        ))}
      </div>

      {loading && !tasks.length ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4"><Skeleton width="60%" height="16px" /><Skeleton width="40%" height="12px" className="mt-2" /></div>
          ))}
        </div>
      ) : tasks.length ? (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`chip ${STATUS_CHIP[t.status] || "chip-gray"}`}>{t.status.toLowerCase()}</span>
                    {isOverdue(t.dueAt, t.status) && <span className="text-xs font-medium text-rose-600">Overdue</span>}
                  </div>
                  <h2 className="mt-1 text-sm font-semibold text-slate-800">{t.title}</h2>
                  {t.body && t.body !== t.title && <p className="mt-1 text-sm text-slate-600">{t.body}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Due {fmtDue(t.dueAt)}</span>
                    <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />
                      {view === "mine" ? `From ${t.assignerName}` : `To ${t.assigneeName} (${ROLE_LABEL[t.assigneeRole] || t.assigneeRole})`}
                    </span>
                    {view === "all" && (
                      <span>By {t.assignerName} ({ROLE_LABEL[t.assignerRole] || t.assignerRole})</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {t.status === "OPEN" && String(t.assigneeId) === user!.id && (
                    <button onClick={() => markDone(t)} className="btn btn-success btn-sm" title="Mark done"><Check className="h-4 w-4" /> Done</button>
                  )}
                  {(isOps || String(t.assignerId) === user!.id) && (
                    <button onClick={() => del(t)} className="btn btn-ghost btn-sm text-rose-600 hover:text-rose-700" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card py-16 text-center text-sm text-slate-400">
          {view === "mine" ? "No tasks assigned to you." : view === "assigned" ? "You haven't assigned any tasks yet." : "No tasks found."}
        </div>
      )}

      {assignOpen && meta && (
        <AssignTaskModal meta={meta} onClose={() => setAssignOpen(false)} onDone={() => { setAssignOpen(false); setView(canAssign && !isOps ? "assigned" : view); load(); }} />
      )}
    </div>
  );
}

function AssignTaskModal({ meta, onClose, onDone }: { meta: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const isOps = meta.isOps;
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [targetType, setTargetType] = useState<"USER" | "ROLE" | "INSTRUCTORS">("USER");
  const [role, setRole] = useState("CAPABILITY_MANAGER");
  const [userId, setUserId] = useState("");
  const [userOptions, setUserOptions] = useState<any[]>([]);
  const [instructorOptions, setInstructorOptions] = useState<any[]>([]);
  const [selectedInstructors, setSelectedInstructors] = useState<string[]>([]);
  const [userQ, setUserQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOps && targetType === "USER") {
      const q = new URLSearchParams();
      if (role) q.set("role", role);
      if (userQ.trim()) q.set("q", userQ.trim());
      api.get(`/tasks/assign-options?${q}`).then((r) => setUserOptions(r.users || [])).catch(() => setUserOptions([]));
    }
  }, [isOps, targetType, role, userQ]);

  useEffect(() => {
    if (!isOps || targetType === "INSTRUCTORS") {
      api.get("/tasks/assign-options").then((r) => setInstructorOptions(r.instructors || [])).catch(() => setInstructorOptions([]));
    }
  }, [isOps, targetType]);

  async function submit() {
    setErr(null);
    if (!title.trim()) { setErr("Enter a task description."); return; }
    if (!dueAt) { setErr("Pick a due date and time."); return; }
    setBusy(true);
    try {
      const body: any = { title: title.trim(), body: title.trim(), dueAt: new Date(dueAt).toISOString(), targetType };
      if (isOps) {
        if (targetType === "ROLE") body.role = role;
        else if (targetType === "USER") body.userId = userId;
        else body.instructorIds = selectedInstructors;
      } else {
        body.instructorIds = selectedInstructors;
        body.targetType = "INSTRUCTORS";
      }
      const r = await api.post("/tasks", body);
      toast.success(`Assigned ${r.count} task(s).`);
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const loginInstructors = instructorOptions.filter((i) => i.hasLogin);

  return (
    <Modal title="Assign task" onClose={onClose}>
      <div className="space-y-4">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}

        <div>
          <label className="label">Task</label>
          <textarea className="input" rows={3} placeholder="What needs to be done?" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="label">Due date & time</label>
          <input type="datetime-local" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>

        {isOps ? (
          <div>
            <label className="label">Assign to</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {(["USER", "ROLE", "INSTRUCTORS"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTargetType(t)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${targetType === t ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {t === "USER" ? "Specific person" : t === "ROLE" ? "All by role" : "Specific instructors"}
                </button>
              ))}
            </div>
            {targetType === "ROLE" && (
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="SENIOR_MANAGER">All Senior Managers</option>
                <option value="CAPABILITY_MANAGER">All Capability Managers</option>
                <option value="INSTRUCTOR">All Instructors</option>
              </select>
            )}
            {targetType === "USER" && (
              <div className="space-y-2">
                <select className="input" value={role} onChange={(e) => { setRole(e.target.value); setUserId(""); }}>
                  <option value="SENIOR_MANAGER">Senior Manager</option>
                  <option value="CAPABILITY_MANAGER">Capability Manager</option>
                  <option value="INSTRUCTOR">Instructor</option>
                  <option value="OPS_ADMIN">Ops Admin</option>
                </select>
                <input className="input" placeholder="Search by name or email…" value={userQ} onChange={(e) => setUserQ(e.target.value)} />
                <ScrollSelect value={userId} onChange={setUserId} placeholder="— select person —"
                  options={[{ value: "", label: "— select person —" }, ...userOptions.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))]} />
              </div>
            )}
            {targetType === "INSTRUCTORS" && (
              <InstructorPicker options={loginInstructors} selected={selectedInstructors} onChange={setSelectedInstructors} />
            )}
          </div>
        ) : (
          <div>
            <label className="label">Assign to instructor(s)</label>
            <InstructorPicker options={loginInstructors} selected={selectedInstructors} onChange={setSelectedInstructors} />
            {!loginInstructors.length && <p className="mt-1 text-xs text-amber-600">No instructors in your scope with login accounts.</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button type="button" disabled={busy} onClick={submit} className="btn btn-primary btn-sm disabled:opacity-50">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning…</> : "Assign"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function InstructorPicker({ options, selected, onChange }: { options: any[]; selected: string[]; onChange: (ids: string[]) => void }) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
      {options.length ? options.map((i) => (
        <label key={i.instructorId} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
          <input type="checkbox" checked={selected.includes(i.instructorId)} onChange={() => toggle(i.instructorId)} />
          <span className="text-slate-800">{i.name}</span>
          <span className="text-xs text-slate-400">{i.employeeId}</span>
        </label>
      )) : (
        <p className="px-3 py-4 text-xs text-slate-400">No instructors available.</p>
      )}
    </div>
  );
}
