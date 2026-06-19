import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users2, Activity, History as HistoryIcon, LogIn, Pencil } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, User, AuditLog, LoginEvent } from "@/models/index.js";
import { canAccessInstructor, canViewAudit } from "@/lib/rbac.js";
import { LIFECYCLE_LABEL } from "@/lib/enums.js";

const dt = (d) => (d ? new Date(d).toLocaleString() : "—");

export default async function InstructorHistoryPage({ params }) {
  const user = await getCurrentUser();
  if (!(await canAccessInstructor(user, params.id))) notFound();

  await connectDB();
  const inst = await Instructor.findById(params.id).lean();
  if (!inst) notFound();
  const privileged = canViewAudit(user);

  // Resolve all the user names referenced by assignments.
  const userIds = new Set();
  (inst.assignments || []).forEach((a) => { if (a.managerId) userIds.add(String(a.managerId)); if (a.assignedById) userIds.add(String(a.assignedById)); });
  if (inst.currentManagerId) userIds.add(String(inst.currentManagerId));
  const refUsers = await User.find({ _id: { $in: [...userIds] } }).select("name").lean();
  const nameOf = Object.fromEntries(refUsers.map((u) => [String(u._id), u.name]));

  const assignments = [...(inst.assignments || [])].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  const managerChanges = Math.max(0, assignments.length - 1);
  const lifecycle = [...(inst.lifecycle || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Field/track change log + login activity (privileged roles).
  let audit = [];
  let logins = [];
  let loginCount = 0;
  let linkedUser = null;
  if (privileged) {
    audit = await AuditLog.find({ instructorId: inst._id }).sort({ createdAt: -1 }).limit(100).lean();
    if (inst.email) {
      linkedUser = await User.findOne({ email: String(inst.email).toLowerCase() }).select("_id email").lean();
      if (linkedUser) {
        loginCount = await LoginEvent.countDocuments({ userId: linkedUser._id });
        logins = await LoginEvent.find({ userId: linkedUser._id }).sort({ at: -1 }).limit(50).lean();
      }
    }
  }

  const fieldChanges = audit.filter((a) => a.action === "FIELD_EDIT");

  return (
    <div className="space-y-5">
      <Link href={`/app/instructors/${inst._id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>

      <div className="card flex flex-wrap items-center gap-4 p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700">{inst.name.charAt(0)}</div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{inst.name} <span className="text-base font-normal text-slate-400">· History</span></h1>
          <p className="text-sm text-slate-500">
            <span className="font-mono">{inst.employeeId}</span> · {inst.campus || "no campus"} ·{" "}
            <span className="chip chip-status">{LIFECYCLE_LABEL[inst.status] || inst.status}</span> ·
            Current manager: {nameOf[String(inst.currentManagerId)] || "— unassigned —"}
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users2} tone="brand" value={managerChanges} label="Manager change(s)" />
        <Stat icon={Activity} tone="emerald" value={lifecycle.length} label="Lifecycle event(s)" />
        {privileged && <Stat icon={Pencil} tone="amber" value={fieldChanges.length} label="Field change(s)" />}
        {privileged && <Stat icon={LogIn} tone="cyan" value={loginCount} label="Sign-in(s)" hint={linkedUser ? null : "no login account"} />}
      </div>

      {/* Manager history */}
      <Section icon={Users2} title="Manager history" subtitle={`${assignments.length} assignment(s), ${managerChanges} change(s)`}>
        {assignments.length === 0 ? <Empty text="No assignment history." /> : (
          <ol className="relative space-y-5 border-l-2 border-slate-100 pl-6">
            {assignments.slice().reverse().map((a, i) => {
              const current = !a.endedAt;
              return (
                <li key={i} className="relative">
                  <span className={`absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ${current ? "bg-emerald-500 ring-emerald-50" : "bg-brand-500 ring-brand-50"}`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{nameOf[String(a.managerId)] || "— unknown —"}</span>
                    {current && <span className="chip chip-public">current</span>}
                  </div>
                  <p className="text-xs text-slate-500">{dt(a.startedAt)} → {a.endedAt ? dt(a.endedAt) : "present"}</p>
                  {a.assignedById && <p className="text-xs text-slate-400">assigned by {nameOf[String(a.assignedById)] || "—"}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {/* Lifecycle history */}
      <Section icon={Activity} title="Lifecycle history" subtitle={`${lifecycle.length} event(s)`}>
        {lifecycle.length === 0 ? <Empty text="No lifecycle events." /> : (
          <ol className="relative space-y-5 border-l-2 border-slate-100 pl-6">
            {lifecycle.map((l, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 ring-4 ring-brand-50" />
                <div className="flex items-center gap-2">
                  <span className="chip chip-status">{LIFECYCLE_LABEL[l.status] || l.status}</span>
                  <span className="text-xs text-slate-400">{dt(l.createdAt)}</span>
                </div>
                {l.note && <p className="mt-1 text-sm text-slate-600">{l.note}</p>}
                <p className="text-xs text-slate-400">by {l.actorName || "—"}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Field / track / subject change log */}
      {privileged && (
        <Section icon={HistoryIcon} title="Field & data changes" subtitle={`${fieldChanges.length} change(s) — tracks, subjects, scores, etc.`}>
          {fieldChanges.length === 0 ? <Empty text="No field changes recorded." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Field</th><th className="px-4 py-2.5">Change</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5">Reason</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fieldChanges.map((a) => (
                    <tr key={String(a._id)}>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{dt(a.createdAt)}</td>
                      <td className="px-4 py-2.5 font-medium">{a.fieldName || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500"><span className="text-slate-400">{a.oldValue ?? "—"}</span> → <span className="font-medium text-slate-700">{a.newValue ?? "—"}</span></td>
                      <td className="px-4 py-2.5">{a.actorName}</td>
                      <td className="px-4 py-2.5 text-slate-400">{a.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* Login activity */}
      {privileged && (
        <Section icon={LogIn} title="Login activity" subtitle={linkedUser ? `${loginCount} total sign-in(s)` : "This instructor has no login account"}>
          {!linkedUser ? <Empty text="No linked user account, so there's no sign-in history." />
            : logins.length === 0 ? <Empty text="No sign-ins recorded yet." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5">IP</th><th className="px-4 py-2.5">Device / browser</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logins.map((e) => (
                    <tr key={String(e._id)}>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{dt(e.at)}</td>
                      <td className="px-4 py-2.5"><span className="chip chip-gray">{e.method}</span></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{e.ip || "—"}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate text-xs text-slate-400" title={e.userAgent}>{e.userAgent || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {!privileged && (
        <p className="text-center text-xs text-slate-400">Field-change and login history are visible to Senior Managers and Ops Admins.</p>
      )}
    </div>
  );
}

function Stat({ icon: Icon, tone, value, label, hint }) {
  const tones = { brand: "text-brand-600 bg-brand-50", emerald: "text-emerald-600 bg-emerald-50", amber: "text-amber-600 bg-amber-50", cyan: "text-cyan-600 bg-cyan-50" };
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`rounded-xl p-3 ${tones[tone]}`}><Icon className="h-6 w-6" /></div>
      <div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-500">{label}</div>{hint && <div className="text-[11px] text-slate-400">{hint}</div>}</div>
    </div>
  );
}
function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-brand-600" />
        <div><h2 className="font-semibold">{title}</h2>{subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}</div>
      </div>
      {children}
    </div>
  );
}
function Empty({ text }) { return <p className="text-sm text-slate-400">{text}</p>; }
