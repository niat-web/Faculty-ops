import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckSquare, Loader2, Plus, Search, Calendar, MessageSquare, Flag } from "lucide-react";
import { api } from "../api";
import { useAuth, ROLE_LABEL } from "../auth";
import { useToast } from "../toast";
import { useDebouncedValue } from "../hooks";
import { Skeleton } from "../components/Skeleton";
import AssignTaskModal from "../components/AssignTaskModal";

export type TaskItem = {
  id: string;
  title: string;
  body: string;
  status: string;
  priority: string;
  dueAt: string;
  assignerId: string;
  assignerName: string;
  assignerRole: string;
  assigneeId: string;
  assigneeName: string;
  assigneeRole: string;
  commentCount: number;
  completedAt?: string | null;
  createdAt: string;
};

const PRIORITY_BAND: Record<string, string> = {
  LOW: "border-l-sky-400 bg-sky-50/40",
  MEDIUM: "border-l-amber-400 bg-amber-50/30",
  HIGH: "border-l-rose-500 bg-rose-50/40",
};

const PRIORITY_CIRCLE: Record<string, string> = {
  LOW: "border-sky-400 hover:border-sky-500 hover:bg-sky-50",
  MEDIUM: "border-amber-400 hover:border-amber-500 hover:bg-amber-50",
  HIGH: "border-rose-500 hover:border-rose-600 hover:bg-rose-50",
};

const PRIORITY_FLAG: Record<string, string> = {
  LOW: "text-sky-400",
  MEDIUM: "text-amber-400",
  HIGH: "text-rose-400",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const PRIORITY_CHIP: Record<string, string> = {
  LOW: "bg-sky-100 text-sky-700",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-rose-100 text-rose-700",
};

function fmtDue(d: string) {
  const dt = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(dt);
  dueDay.setHours(0, 0, 0, 0);
  const diff = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  const time = dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  if (diff === -1) return `Yesterday ${time}`;
  return dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isOverdue(d: string, status: string) {
  return status === "OPEN" && new Date(d).getTime() < Date.now();
}

function isDueToday(d: string, status: string) {
  if (status !== "OPEN") return false;
  const dt = new Date(d);
  const today = new Date();
  return dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate();
}

function dueUrgencyClass(d: string, status: string) {
  if (status === "DONE") return "text-slate-400";
  if (status === "CANCELLED") return "text-slate-400";
  if (isOverdue(d, status)) return "text-rose-600 font-semibold";
  if (isDueToday(d, status)) return "text-amber-700 font-medium";
  return "text-slate-600";
}

function rowStatusClass(t: TaskItem) {
  if (t.status === "DONE") return "bg-emerald-50/60";
  if (t.status === "CANCELLED") return "bg-slate-50/80";
  if (isOverdue(t.dueAt, t.status)) return "bg-rose-50/50";
  if (isDueToday(t.dueAt, t.status)) return "bg-amber-50/40";
  return "bg-white";
}

export default function TasksPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<any>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"mine" | "assigned" | "all">("mine");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const dq = useDebouncedValue(search, 300);
  const [assignOpen, setAssignOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  function load() {
    const q = new URLSearchParams();
    q.set("view", view);
    if (statusFilter) q.set("status", statusFilter);
    if (dq.trim()) q.set("q", dq.trim());
    return api.get(`/tasks?${q}`).then((r) => setTasks(r.tasks || [])).catch((e) => toast.error(e.message));
  }

  useEffect(() => {
    api.get("/tasks/meta").then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [view, statusFilter, dq]);

  const openCount = useMemo(() => tasks.filter((t) => t.status === "OPEN").length, [tasks]);
  const canAssign = meta?.canAssign;
  const isOps = meta?.isOps;

  async function markDone(e: React.MouseEvent, t: TaskItem) {
    e.preventDefault();
    e.stopPropagation();
    if (t.status !== "OPEN" || String(t.assigneeId) !== user!.id) return;
    setMarkingId(t.id);
    try {
      await api.patch(`/tasks/${t.id}`, { status: "DONE" });
      setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: "DONE", completedAt: new Date().toISOString() } : x));
      toast.success("Marked done.");
    } catch (err: any) { toast.error(err.message); }
    finally { setMarkingId(null); }
  }

  return (
    <div className="space-y-5">
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

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input w-full pl-9"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setView("mine")} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === "mine" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          My tasks{view === "mine" && openCount > 0 ? ` (${openCount})` : ""}
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading && !tasks.length ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4">
                <Skeleton width="20px" height="20px" className="rounded-full" />
                <Skeleton width="70%" height="14px" />
              </div>
            ))}
          </div>
        ) : tasks.length ? (
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <TodoRow
                key={t.id}
                task={t}
                view={view}
                canMark={t.status === "OPEN" && String(t.assigneeId) === user!.id}
                marking={markingId === t.id}
                onMark={(e) => markDone(e, t)}
                onOpen={() => navigate(`/app/tasks/${t.id}`)}
              />
            ))}
          </ul>
        ) : (
          <div className="py-16 text-center text-sm text-slate-400">
            {dq.trim() ? "No tasks match your search." : view === "mine" ? "No tasks assigned to you." : view === "assigned" ? "You haven't assigned any tasks yet." : "No tasks found."}
          </div>
        )}
      </div>

      {assignOpen && meta && (
        <AssignTaskModal meta={meta} onClose={() => setAssignOpen(false)} onDone={() => { setAssignOpen(false); setView(canAssign && !isOps ? "assigned" : view); load(); }} />
      )}
    </div>
  );
}

function TodoRow({ task: t, view, canMark, marking, onMark, onOpen }: {
  task: TaskItem;
  view: string;
  canMark: boolean;
  marking: boolean;
  onMark: (e: React.MouseEvent) => void;
  onOpen: () => void;
}) {
  const done = t.status === "DONE";
  const cancelled = t.status === "CANCELLED";
  const overdue = isOverdue(t.dueAt, t.status);
  const pri = t.priority || "MEDIUM";
  const assigneeLabel = view === "mine" ? t.assignerName : t.assigneeName;
  const rowBg = rowStatusClass(t);

  return (
    <li className={`group flex items-stretch transition hover:brightness-[0.98] ${rowBg} ${done ? "opacity-80" : ""}`}>
      <div className={`w-1 shrink-0 ${pri === "HIGH" ? "bg-rose-500" : pri === "LOW" ? "bg-sky-400" : "bg-amber-400"} ${done ? "bg-emerald-500" : cancelled ? "bg-slate-300" : ""}`} />
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 sm:px-4">
        <div className="relative shrink-0">
          {canMark ? (
            <button
              type="button"
              onClick={onMark}
              disabled={marking}
              title="Mark done"
              className={`group/check relative flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white transition disabled:opacity-50 ${PRIORITY_CIRCLE[pri] || PRIORITY_CIRCLE.MEDIUM}`}
            >
              {marking ? (
                <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
              ) : (
                <span className={`pointer-events-none absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover/check:opacity-100`}>
                  Done
                </span>
              )}
            </button>
          ) : (
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${done ? "border-emerald-500 bg-emerald-500 text-white" : cancelled ? "border-slate-300 bg-slate-100" : `bg-white ${PRIORITY_CIRCLE[pri] || PRIORITY_CIRCLE.MEDIUM}`}`}>
              {done && <span className="text-[10px] font-bold">✓</span>}
            </span>
          )}
        </div>

        <Link to={`/app/tasks/${t.id}`} onClick={(e) => { e.preventDefault(); onOpen(); }} className={`min-w-0 flex-1 border-l-4 pl-3 ${done ? "border-l-emerald-400" : cancelled ? "border-l-slate-300" : PRIORITY_BAND[pri] || PRIORITY_BAND.MEDIUM}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-medium ${done ? "text-slate-400 line-through" : cancelled ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</span>
            {!done && !cancelled && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_CHIP[pri] || PRIORITY_CHIP.MEDIUM}`}>
                {PRIORITY_LABEL[pri] || pri}
              </span>
            )}
            {done && <span className="text-[10px] font-semibold text-emerald-600">Completed</span>}
            {overdue && !done && <span className="text-[10px] font-semibold text-rose-600">Overdue</span>}
            {cancelled && <span className="text-[10px] font-medium text-slate-400">Cancelled</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className={`inline-flex items-center gap-1 ${overdue && !done ? "font-medium text-rose-600" : isDueToday(t.dueAt, t.status) && !done ? "font-medium text-amber-700" : "text-slate-500"}`}>
              <Calendar className="h-3 w-3" />{fmtDue(t.dueAt)}
            </span>
            <span className={dueUrgencyClass(t.dueAt, t.status)}>
              {view === "mine" ? `From ${assigneeLabel}` : `To ${assigneeLabel}`}
              {view === "all" && ` · By ${t.assignerName}`}
            </span>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2 text-slate-400">
          {t.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs" title={`${t.commentCount} comment(s)`}>
              <MessageSquare className="h-3.5 w-3.5" />{t.commentCount}
            </span>
          )}
          <Flag className={`h-3.5 w-3.5 ${done ? "text-emerald-400" : PRIORITY_FLAG[pri] || PRIORITY_FLAG.MEDIUM}`} />
        </div>
      </div>
    </li>
  );
}
