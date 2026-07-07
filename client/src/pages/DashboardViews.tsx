import { Link, useNavigate } from "react-router-dom";
import {
  Users, GraduationCap, Clock, Building2, CalendarClock, Activity, Star, TrendingUp,
  Network, ScrollText, BookOpen, ArrowRight, ChevronRight, UserPlus, Trophy, AlertTriangle, ShieldCheck, Briefcase, UserCheck,
} from "lucide-react";
import { LIFECYCLE_LABEL, ROLE_LABEL } from "../auth";
import { GreetingHeader, TrendArea } from "../components/charts";
import NotificationBell from "../components/NotificationBell";
import { Panel, MetricTile, Ring, Donut, LegendList, Leaderboard, MiniBars, Avatar, Empty, STATUS_COLOR, PALETTE } from "../components/dashboard";

// Heavy (recharts-backed) role dashboards, lazy-loaded by DashboardPage so recharts is NOT in the initial
// paint. DashboardPage shows <DashboardSkeleton/> while this chunk (and the live BigQuery data) load.
export default function DashboardViews({ d, user, first }: { d: any; user: any; first: string }) {
  if (d.role === "OPS_ADMIN") return <AdminDash d={d} first={first} />;
  if (d.role === "SENIOR_MANAGER") return <SeniorDash d={d} first={first} />;
  if (d.role === "CAPABILITY_MANAGER") return <CapabilityDash d={d} first={first} />;
  return <InstructorDash d={d} first={first} user={user} />;
}

/* ── shared helpers ── */
const enc = encodeURIComponent;
const statusItems = (byStatus: any[] = []) => byStatus.map((s, i) => ({ name: s.name, key: s.status, value: s.value, color: STATUS_COLOR[s.status] || PALETTE[i % PALETTE.length] }));
const monthlyDelta = (joins: any[] = []) => (joins.length > 1 ? joins[joins.length - 1].value - joins[joins.length - 2].value : 0);
const BUCKET_COLORS = ["#ef4444", "#f59e0b", "#06b6d4", "#22c55e"];

function QuickLink({ to, icon: Icon, children }: any) { return <Link to={to} className="btn btn-ghost btn-sm"><Icon className="h-4 w-4" /> {children}</Link>; }
function MiniStat({ label, value, tone = "slate" }: { label: string; value: any; tone?: string }) {
  const tones: any = { emerald: "bg-emerald-50 text-emerald-700", rose: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-700", brand: "bg-brand-50 text-brand-700", slate: "bg-slate-50 text-slate-700" };
  return <div className={`rounded-xl px-3 py-2 ${tones[tone]}`}><div className="text-lg font-bold leading-none">{value}</div><div className="mt-1 text-[11px] opacity-80">{label}</div></div>;
}
function relTime(t: any) {
  const ms = new Date(t).getTime();
  if (!t || isNaN(ms)) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function RecentlyAdded({ list }: { list: any[] }) {
  if (!list?.length) return <Empty label="No recent additions" />;
  return (
    <ul className="space-y-3">
      {list.map((j) => (
        <li key={j.id}>
          <Link to={`/app/instructors/${j.id}`} className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-slate-50">
            <Avatar name={j.name} color={STATUS_COLOR[j.status] || "#94a3b8"} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-800">{j.name}</div><div className="truncate text-[11px] text-slate-400">{j.campus || "no campus"} · {LIFECYCLE_LABEL[j.status] || j.status}</div></div>
            <span className="shrink-0 text-[11px] text-slate-400">{relTime(j.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
function InterventionList({ list }: { list: any[] }) {
  if (!list?.length) return <Empty label="No at-risk or overdue learners" />;
  const tone = (health: string) => /overdue/i.test(health) ? "bg-slate-100 text-slate-700" : "bg-rose-50 text-rose-700";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-2 py-2">Learner</th>
            <th className="px-2 py-2">Health</th>
            <th className="px-2 py-2 text-right">Days</th>
            <th className="px-2 py-2">Predicted</th>
            <th className="px-2 py-2 text-right">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((r) => (
            <tr key={r.id}>
              <td className="max-w-[180px] px-2 py-2">
                <Link to={`/app/instructors/${r.id}`} className="block truncate font-medium text-slate-800 hover:text-brand-600" title={r.name}>{r.name}</Link>
                <div className="truncate font-mono text-[11px] text-slate-400">{r.employeeId}</div>
              </td>
              <td className="px-2 py-2"><span className={`chip ${tone(r.health)}`}>{r.health}</span></td>
              <td className="px-2 py-2 text-right text-slate-600">{r.daysToDeadline ?? "—"}</td>
              <td className="px-2 py-2 text-slate-600 cell-trunc" title={r.predictedCompletion || "—"}>{r.predictedCompletion || "—"}</td>
              <td className="px-2 py-2 text-right font-medium text-slate-800">{r.gapDays || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════ Ops Admin ════════════════════════════ */
function AdminDash({ d, first }: any) {
  const k = d.kpis, c = d.charts, nav = useNavigate();
  const items = statusItems(c.byStatus);
  const spark = (c.joins || []).map((j: any) => j.value);
  const active = k.total - (k.exiting || 0);
  const attrition = k.total ? Math.round(((k.exited || 0) / k.total) * 100) : 0;
  const staff = (k.ops || 0) + (k.sm || 0) + (k.cm || 0) || 1;
  const wf = [{ name: "Ops Admins", value: k.ops || 0, color: "#6366f1" }, { name: "Senior Managers", value: k.sm || 0, color: "#06b6d4" }, { name: "Capability Managers", value: k.cm || 0, color: "#22c55e" }];

  return (
    <div className="space-y-5">
      <GreetingHeader name={first} subtitle="Organization-wide control center across all NIAT campuses."
        actions={<><QuickLink to="/app/instructors" icon={Users}>Instructors</QuickLink><QuickLink to="/app/org" icon={Network}>Org</QuickLink><QuickLink to="/app/audit" icon={ScrollText}>Audit</QuickLink><NotificationBell /></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Total instructors" value={k.total} icon={Users} tone="brand" delta={monthlyDelta(c.joins)} spark={spark} footer="vs last month" />
        <MetricTile label="Active" value={active} icon={UserCheck} tone="emerald" footer={`${attrition}% exited overall`} />
        <MetricTile label="Avg. training" value={`${k.avgTraining}%`} icon={GraduationCap} tone="cyan" footer="mean completion" />
        <MetricTile label="Pending approvals" value={k.pending} icon={Clock} tone="amber" to="/app/requests" footer={k.pending ? "Needs review →" : "All clear"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Lifecycle status" sub="Distribution across stages · click to filter" className="lg:col-span-2">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Donut data={items} center={<><span className="text-2xl font-bold">{k.total}</span><span className="text-[11px] text-slate-400">instructors</span></>} />
            <div className="w-full flex-1"><LegendList items={items} total={k.total} onItem={(it) => it.key && nav(`/app/instructors?status=${it.key}`)} /></div>
          </div>
        </Panel>
        <Panel title="Training health" sub="Mean completion">
          <div className="space-y-4">
            <Ring value={k.avgTraining} color="#22c55e"><span className="text-3xl font-bold">{k.avgTraining}%</span><span className="text-[11px] text-slate-400">avg</span></Ring>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="On track (≥76%)" value={c.trainingBuckets?.[3]?.value ?? 0} tone="emerald" />
              <MiniStat label="At risk (≤25%)" value={c.trainingBuckets?.[0]?.value ?? 0} tone="rose" />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Top campuses" sub="By headcount" icon={Building2}><Leaderboard items={(c.byCampus || []).slice(0, 6)} color="#6366f1" to={(it) => `/app/instructors?campus=${enc(it.name)}`} /></Panel>
        <Panel title="Manager workload" sub="Reportees per manager" icon={Users}><Leaderboard items={(c.workload || []).slice(0, 6)} color="#06b6d4" /></Panel>
        <Panel title="Completion spread" sub="Instructors per band" icon={GraduationCap}><MiniBars data={c.trainingBuckets} colors={BUCKET_COLORS} /></Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Joining trend" sub="New records · last 6 months" icon={TrendingUp} className="lg:col-span-2"><TrendArea data={c.joins} color="#6366f1" height={220} /></Panel>
        <Panel title="Workforce" sub={`${k.ops + k.sm + k.cm} staff total`} icon={ShieldCheck}>
          <div className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full">{wf.map((s, i) => s.value > 0 && <div key={i} style={{ width: `${(s.value / staff) * 100}%`, background: s.color }} />)}</div>
          <LegendList items={wf} total={staff} />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Recent activity" icon={Activity} className="lg:col-span-2" action={<Link to="/app/audit" className="text-xs text-brand-600 hover:underline">View audit →</Link>}>
          {d.recent?.length ? (
            <ul className="space-y-1">
              {d.recent.map((a: any) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <Avatar name={a.actorName} />
                  <p className="min-w-0 flex-1 text-sm text-slate-700"><span className="font-medium text-slate-900">{a.actorName}</span> {a.action.replace(/_/g, " ").toLowerCase()}{a.instructorName ? <> · <span className="font-medium">{a.instructorName}</span></> : ""}</p>
                  <span className="shrink-0 text-[11px] text-slate-400">{relTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty label="No activity yet" />}
        </Panel>
        <Panel title="Recently added" sub="Newest instructor records" icon={UserPlus}><RecentlyAdded list={d.recentJoiners} /></Panel>
      </div>
    </div>
  );
}

/* ══════════════════════════ Senior Manager ══════════════════════════ */
function SeniorDash({ d, first }: any) {
  const k = d.kpis, c = d.charts, nav = useNavigate();
  const items = statusItems(c.byStatus);
  return (
    <div className="space-y-5">
      <GreetingHeader name={first} subtitle="Org-wide oversight and approvals."
        actions={<><QuickLink to="/app/requests" icon={Clock}>Requests</QuickLink><QuickLink to="/app/instructors" icon={Users}>Instructors</QuickLink><NotificationBell /></>} />

      {k.pending > 0 && (
        <Link to="/app/requests" className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-5 py-3.5 text-sm text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100">
          <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> <b>{k.pending}</b> edit request(s) awaiting your decision.</span>
          <span className="inline-flex items-center gap-1 font-medium">Review <ArrowRight className="h-4 w-4" /></span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Instructors" value={k.total} icon={Users} tone="brand" delta={monthlyDelta(c.joins)} spark={(c.joins || []).map((j: any) => j.value)} />
        <MetricTile label="Pending approvals" value={k.pending} icon={Clock} tone="amber" to="/app/requests" footer={k.pending ? "Needs review →" : "All clear"} />
        <MetricTile label="Avg. training" value={`${k.avgTraining}%`} icon={GraduationCap} tone="emerald" footer="mean completion" />
        <MetricTile label="Campuses" value={k.campuses} icon={Building2} tone="cyan" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Lifecycle status" sub="Click to filter" className="lg:col-span-2">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Donut data={items} center={<><span className="text-2xl font-bold">{k.total}</span><span className="text-[11px] text-slate-400">total</span></>} />
            <div className="w-full flex-1"><LegendList items={items} total={k.total} onItem={(it) => it.key && nav(`/app/instructors?status=${it.key}`)} /></div>
          </div>
        </Panel>
        <Panel title="Training health" sub="Mean completion">
          <div className="space-y-4">
            <Ring value={k.avgTraining} color="#22c55e"><span className="text-3xl font-bold">{k.avgTraining}%</span><span className="text-[11px] text-slate-400">avg</span></Ring>
            <div className="grid grid-cols-2 gap-3"><MiniStat label="On track (≥76%)" value={c.trainingBuckets?.[3]?.value ?? 0} tone="emerald" /><MiniStat label="At risk (≤25%)" value={c.trainingBuckets?.[0]?.value ?? 0} tone="rose" /></div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Top campuses" icon={Building2}><Leaderboard items={(c.byCampus || []).slice(0, 6)} color="#6366f1" to={(it) => `/app/instructors?campus=${enc(it.name)}`} /></Panel>
        <Panel title="Manager workload" icon={Users}><Leaderboard items={(c.workload || []).slice(0, 6)} color="#06b6d4" /></Panel>
        <Panel title="Recently added" icon={UserPlus}><RecentlyAdded list={d.recentJoiners} /></Panel>
      </div>

      <Panel title="Joining trend" sub="New records · last 6 months" icon={TrendingUp}><TrendArea data={c.joins} color="#06b6d4" height={220} /></Panel>
    </div>
  );
}

/* ════════════════════════ Capability Manager ════════════════════════ */
function CapabilityDash({ d, first }: any) {
  const k = d.kpis, c = d.charts;
  const items = statusItems(c.byStatus);
  const prog = c.reporteeProgress || [];
  const onTrack = prog.filter((r: any) => r.value >= 80).length;
  const top = prog.slice(0, 5);

  return (
    <div className="space-y-5">
      <GreetingHeader name={first} subtitle="Your team of reportees at a glance."
        actions={<><QuickLink to="/app/instructors" icon={Users}>Reportees</QuickLink><QuickLink to="/app/training" icon={BookOpen}>Training</QuickLink><NotificationBell /></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="My reportees" value={k.total} icon={Users} tone="brand" />
        <MetricTile label="Avg. training" value={`${k.avgTraining}%`} icon={GraduationCap} tone="emerald" footer="team mean" />
        <MetricTile label="On track (≥80%)" value={`${onTrack}/${k.total}`} icon={TrendingUp} tone="cyan" />
        <MetricTile label="Deadlines (30d)" value={d.deadlines?.length || 0} icon={CalendarClock} tone="pink" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Reportee status">
          <div className="flex flex-col items-center gap-5">
            <Donut data={items} size={150} center={<><span className="text-xl font-bold">{k.total}</span><span className="text-[11px] text-slate-400">team</span></>} />
            <div className="w-full"><LegendList items={items} total={k.total} /></div>
          </div>
        </Panel>
        <Panel title="Top performers" sub="Highest completion" icon={Trophy}><Leaderboard items={top} color="#22c55e" unit="%" to={(it) => `/app/instructors/${it.id}`} /></Panel>
        <Panel title="Learners requiring immediate attention" sub="At Risk + Overdue" icon={AlertTriangle}><InterventionList list={d.interventions || []} /></Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Team training health"><Ring value={k.avgTraining} color="#22c55e"><span className="text-3xl font-bold">{k.avgTraining}%</span><span className="text-[11px] text-slate-400">avg</span></Ring></Panel>
        <Panel title="Upcoming deadlines" sub="Next 30 days" icon={CalendarClock} className="lg:col-span-2">
          {d.deadlines?.length ? (
            <ul className="space-y-2.5">
              {d.deadlines.map((x: any) => (
                <li key={x.id}>
                  <Link to={`/app/instructors/${x.id}`} className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-slate-50">
                    <Avatar name={x.name} color="#ec4899" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{x.name}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-medium text-pink-700"><CalendarClock className="h-3.5 w-3.5" /> {new Date(x.date).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty label="No deadlines in the next 30 days 🎉" />}
        </Panel>
      </div>

      <Link to="/app/instructors" className="flex items-center justify-between rounded-xl bg-brand-50 px-5 py-3.5 text-sm font-medium text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100"><span>Manage all your reportees</span><ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

/* ════════════════════════════ Instructor ════════════════════════════ */
const JOURNEY = ["ONBOARDING", "IN_TRAINING", "CONFIRMED"];
function InstructorDash({ d, first, user }: any) {
  if (!d.me) return (
    <div className="space-y-5">
      <GreetingHeader name={first} subtitle="Your profile summary." />
      <div className="card p-8 text-center"><Briefcase className="mx-auto mb-3 h-8 w-8 text-slate-300" /><h2 className="text-lg font-semibold">No linked profile yet</h2><p className="mt-1 text-sm text-slate-500">No instructor profile is linked to your account. Please contact your Operations Admin.</p></div>
    </div>
  );
  const me = d.me;
  const curIdx = JOURNEY.indexOf(me.status);
  const details = [["Employee ID", me.employeeId], ["Primary track", me.track || "—"], ["Track deadline", me.deadline || "—"], ["Manager", me.manager || "—"]];

  return (
    <div className="space-y-5">
      <GreetingHeader name={first} subtitle="Here's how your journey is tracking."
        actions={<><QuickLink to="/app/my-stats" icon={BookOpen}>My stats</QuickLink><QuickLink to={`/app/instructors/${me.id}`} icon={ArrowRight}>Profile</QuickLink><NotificationBell /></>} />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-brand-600 to-brand-500 p-6 text-white">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold">{first.charAt(0)}</span>
          <div className="flex-1"><h2 className="text-xl font-bold">{user.name}</h2><p className="text-sm text-white/80"><span className="font-mono">{me.employeeId}</span> · {me.campus || "no campus"} · {ROLE_LABEL[user.role]}</p></div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium">{LIFECYCLE_LABEL[me.status] || me.status}</span>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
          {details.map(([l, v]) => <div key={l as string} className="bg-white p-4"><div className="text-xs text-slate-400">{l}</div><div className="mt-0.5 truncate font-medium text-slate-800">{v}</div></div>)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile label="Training completion" value={`${me.training}%`} icon={GraduationCap} tone="emerald" />
        <MetricTile label="Review score" value={me.review ?? "—"} icon={Star} tone="amber" />
        <MetricTile label="Current status" value={LIFECYCLE_LABEL[me.status] || me.status} icon={Activity} tone="brand" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="My training completion" sub="Primary track"><Ring value={me.training} color="#22c55e"><span className="text-3xl font-bold">{me.training}%</span><span className="text-[11px] text-slate-400">complete</span></Ring></Panel>

        <Panel title="My journey" sub="Lifecycle progress" className="lg:col-span-2">
          {curIdx >= 0 ? (
            <ol className="flex items-center">
              {JOURNEY.map((s, i) => (
                <li key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${i <= curIdx ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"}`}>{i < curIdx ? "✓" : i + 1}</span>
                    <span className={`mt-1.5 text-[11px] ${i <= curIdx ? "font-medium text-slate-700" : "text-slate-400"}`}>{LIFECYCLE_LABEL[s]}</span>
                  </div>
                  {i < JOURNEY.length - 1 && <span className={`mx-2 h-0.5 flex-1 rounded ${i < curIdx ? "bg-brand-500" : "bg-slate-200"}`} />}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-slate-500">Current status: <b>{LIFECYCLE_LABEL[me.status] || me.status}</b></p>}
          <div className="mt-6 space-y-2.5">
            <NextItem to="/app/my-stats" icon={BookOpen} title="Update my training stats" desc="Mark modules complete to raise your completion %." />
            <NextItem to={`/app/instructors/${me.id}`} icon={ShieldCheck} title="Review my profile" desc="Check your personal & hiring details are correct." />
            {me.deadline && me.deadline !== "—" && <NextItem to="/app/my-stats" icon={CalendarClock} title={`Track deadline: ${me.deadline}`} desc="Stay on pace to finish on time." tone="bg-pink-100 text-pink-700" />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function NextItem({ to, icon: Icon, title, desc, tone = "bg-brand-100 text-brand-700" }: any) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-slate-50">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-800">{title}</div><div className="truncate text-xs text-slate-500">{desc}</div></div>
      <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </Link>
  );
}
