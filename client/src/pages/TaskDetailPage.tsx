import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Calendar, Check, CheckSquare, Clock, Flag, Loader2, MessageSquare,
  Send, Trash2, User, RotateCcw, Bell,
} from "lucide-react";
import { api } from "../api";
import { useAuth, ROLE_LABEL } from "../auth";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import { Skeleton } from "../components/Skeleton";

const PRIORITY_BAND: Record<string, string> = {
  LOW: "border-sky-400 bg-sky-50",
  MEDIUM: "border-amber-400 bg-amber-50",
  HIGH: "border-rose-500 bg-rose-50",
};

const PRIORITY_CHIP: Record<string, string> = {
  LOW: "bg-sky-100 text-sky-700 border-sky-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  HIGH: "bg-rose-100 text-rose-700 border-rose-200",
};

const STATUS_CHIP: Record<string, string> = {
  OPEN: "bg-brand-50 text-brand-700 border-brand-200",
  DONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
};

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TaskDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    return api.get(`/tasks/${id}`).then((r) => { setTask(r.task); setErr(null); }).catch((e) => setErr(e.message));
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [id]);

  const isOps = user?.role === "OPS_ADMIN";
  const isAssignee = task && String(task.assigneeId) === user?.id;
  const isAssigner = task && String(task.assignerId) === user?.id;
  const canMark = task?.status === "OPEN" && (isAssignee || isOps);
  const canDelete = task && (isOps || isAssigner);
  const pri = task?.priority || "MEDIUM";

  async function markDone() {
    setBusy(true);
    try {
      const r = await api.patch(`/tasks/${id}`, { status: "DONE" });
      setTask((t: any) => ({ ...t, ...r.task, comments: t.comments }));
      toast.success("Task marked done.");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function reopen() {
    setBusy(true);
    try {
      const r = await api.patch(`/tasks/${id}`, { status: "OPEN" });
      setTask((t: any) => ({ ...t, ...r.task, comments: t.comments }));
      toast.success("Task reopened.");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    try {
      const r = await api.post(`/tasks/${id}/comments`, { body: comment.trim() });
      setTask((t: any) => ({ ...t, comments: [...(t.comments || []), r.comment], commentCount: (t.commentCount || 0) + 1 }));
      setComment("");
    } catch (e: any) { toast.error(e.message); }
    finally { setPosting(false); }
  }

  async function del() {
    if (!(await confirm({ title: "Delete task?", message: "This can't be undone.", confirmText: "Delete", danger: true }))) return;
    try {
      await api.del(`/tasks/${id}`);
      toast.success("Task deleted.");
      navigate("/app/tasks");
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton width="120px" height="16px" />
        <Skeleton width="60%" height="28px" />
        <div className="card p-6"><Skeleton width="100%" height="80px" /></div>
      </div>
    );
  }

  if (err || !task) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link to="/app/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Back to tasks</Link>
        <div className="card p-8 text-center text-sm text-rose-600">{err || "Task not found."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <Link to="/app/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to tasks
      </Link>

      <div className={`overflow-hidden rounded-xl border-2 ${PRIORITY_BAND[pri]?.split(" ")[0] || "border-amber-400"} bg-white shadow-sm`}>
        <div className={`border-b px-5 py-4 ${PRIORITY_BAND[pri] || "bg-amber-50"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_CHIP[pri]}`}>
                  <Flag className="h-3 w-3" /> {(pri || "MEDIUM").toLowerCase()} priority
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_CHIP[task.status] || STATUS_CHIP.OPEN}`}>
                  {task.status.toLowerCase()}
                </span>
              </div>
              <h1 className={`text-xl font-bold text-slate-900 ${task.status === "DONE" ? "line-through opacity-70" : ""}`}>{task.title}</h1>
              {task.body && task.body !== task.title && (
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{task.body}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {canMark && (
                <button disabled={busy} onClick={markDone} className="btn btn-success btn-sm disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mark done
                </button>
              )}
              {task.status === "DONE" && (isAssignee || isOps) && (
                <button disabled={busy} onClick={reopen} className="btn btn-ghost btn-sm disabled:opacity-50">
                  <RotateCcw className="h-4 w-4" /> Reopen
                </button>
              )}
              {canDelete && (
                <button onClick={del} className="btn btn-ghost btn-sm text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <InfoRow icon={Calendar} label="Due" value={fmtDateTime(task.dueAt)} highlight={task.status === "OPEN" && new Date(task.dueAt) < new Date()} />
          <InfoRow icon={User} label="Assigned to" value={`${task.assigneeName} (${ROLE_LABEL[task.assigneeRole] || task.assigneeRole})`} />
          <InfoRow icon={CheckSquare} label="Assigned by" value={`${task.assignerName} (${ROLE_LABEL[task.assignerRole] || task.assignerRole})`} />
          <InfoRow icon={Clock} label="Created" value={fmtDateTime(task.createdAt)} />
          {task.completedAt && <InfoRow icon={Check} label="Completed" value={fmtDateTime(task.completedAt)} />}
          {task.reminderIntervalMs > 0 && (
            <InfoRow icon={Bell} label="Reminders" value={task.reminderLabel || "Recurring"} />
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <MessageSquare className="h-4 w-4 text-brand-600" />
          <h2 className="font-semibold text-slate-800">Comments & activity</h2>
          <span className="ml-auto text-xs text-slate-400">{(task.comments || []).length} message(s)</span>
        </div>

        <div className="max-h-[420px] space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {task.assignerName?.charAt(0) || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">{task.assignerName} <span className="font-normal text-slate-400">assigned this task</span></p>
                <p className="mt-0.5 text-sm text-slate-600">{task.title}</p>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(task.createdAt)}</p>
            </div>
          </div>

          {(task.comments || []).map((c: any) => {
            const mine = String(c.authorId) === user?.id;
            return (
              <div key={c.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${mine ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                  {c.authorName?.charAt(0) || "?"}
                </div>
                <div className={`min-w-0 max-w-[85%] ${mine ? "text-right" : ""}`}>
                  <div className={`rounded-xl px-3 py-2 ${mine ? "rounded-tr-sm bg-brand-600 text-white" : "rounded-tl-sm bg-slate-100 text-slate-800"}`}>
                    <p className={`text-xs font-semibold ${mine ? "text-brand-100" : "text-slate-600"}`}>
                      {c.authorName}
                      {!mine && <span className="font-normal text-slate-400"> · {ROLE_LABEL[c.authorRole] || c.authorRole}</span>}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
                  </div>
                  <p className={`mt-1 text-[11px] text-slate-400 ${mine ? "text-right" : ""}`}>{fmtDateTime(c.createdAt)}</p>
                </div>
              </div>
            );
          })}

          {task.status === "DONE" && task.completedAt && (
            <div className="flex justify-center">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Completed {fmtDateTime(task.completedAt)}
              </span>
            </div>
          )}

          {!task.comments?.length && (
            <p className="py-4 text-center text-xs text-slate-400">No comments yet. Start the conversation below.</p>
          )}
        </div>

        <form onSubmit={postComment} className="flex gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          <input
            className="input flex-1"
            placeholder="Write a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
          />
          <button type="submit" disabled={posting || !comment.trim()} className="btn btn-primary btn-sm shrink-0 disabled:opacity-50">
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </section>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${highlight ? "text-rose-500" : "text-slate-400"}`} />
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`text-sm font-medium ${highlight ? "text-rose-600" : "text-slate-800"}`}>{value}</p>
      </div>
    </div>
  );
}
