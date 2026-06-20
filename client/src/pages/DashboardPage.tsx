import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users, GraduationCap, Clock, Building2, UserMinus, CalendarClock, Activity, Star } from "lucide-react";
import { api } from "../api";
import { useAuth, LIFECYCLE_LABEL } from "../auth";
import { StatCard, ChartCard, StatusDonut, CampusBars, HBar, RadialGauge, TrendArea } from "../components/charts";
import Loading from "../components/Loading";

export default function DashboardPage() {
  const { user } = useAuth();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let on = true; api.get("/dashboard").then((r) => on && setD(r)).catch((e) => on && setErr(e.message)); return () => { on = false; }; }, []);

  if (err) return <div className="card p-6 text-sm text-rose-600">{err}</div>;
  if (!d) return <Loading />;

  const first = (user!.name || "").split(" ")[0];
  if (d.role === "OPS_ADMIN") return <AdminDash d={d} first={first} />;
  if (d.role === "SENIOR_MANAGER") return <SeniorDash d={d} first={first} />;
  if (d.role === "CAPABILITY_MANAGER") return <CapabilityDash d={d} first={first} />;
  return <InstructorDash d={d} first={first} />;
}

function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: any }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{title}</h1><p className="text-sm text-slate-500">{subtitle}</p></div>
      {action}
    </div>
  );
}

function AdminDash({ d, first }: any) {
  const k = d.kpis, c = d.charts;
  const nav = useNavigate();
  const byStatus = (s: any) => s?.status && nav(`/app/instructors?status=${s.status}`);
  const byCampus = (s: any) => s?.campus && nav(`/app/instructors?campus=${encodeURIComponent(s.campus)}`);
  return (
    <div className="space-y-6">
      <Header title={`Welcome, ${first}`} subtitle="Organization-wide analytics across all NIAT campuses." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total instructors" value={k.total} icon={Users} tone="brand" />
        <StatCard label="Campuses" value={k.campuses} icon={Building2} tone="cyan" />
        <StatCard label="Avg. training" value={`${k.avgTraining}%`} icon={GraduationCap} tone="emerald" />
        <StatCard label="Exited / offboarding" value={k.exiting} icon={UserMinus} tone="rose" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Lifecycle status" subtitle="Click a slice to view those instructors"><StatusDonut data={c.byStatus} onSlice={byStatus} /></ChartCard>
        <ChartCard title="Instructors by campus" className="lg:col-span-2"><CampusBars data={c.byCampus} onBar={byCampus} /></ChartCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Avg. training health" subtitle="Mean completion %"><RadialGauge value={k.avgTraining} label="completion" color="#22c55e" /></ChartCard>
        <ChartCard title="Training completion spread" subtitle="Instructors per band"><CampusBars data={c.trainingBuckets} /></ChartCard>
        <ChartCard title="Capability Manager workload" subtitle="Reportees per manager"><HBar data={c.workload} /></ChartCard>
      </div>
      <ChartCard title="Joining trend" subtitle="New instructor records over the last 6 months"><TrendArea data={c.joins} color="#22c55e" /></ChartCard>
      <ChartCard title="Recent activity" action={<Link to="/app/audit" className="text-sm text-brand-600 hover:underline">Audit log →</Link>}>
        {d.recent?.length ? (
          <ul className="divide-y divide-slate-100">
            {d.recent.map((a: any) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span><span className="font-medium">{a.actorName}</span> {a.action.replace(/_/g, " ").toLowerCase()}{a.fieldName ? ` · ${a.fieldName}` : ""}{a.instructorName ? ` on ${a.instructorName}` : ""}</span>
                <span className="shrink-0 text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">No activity yet.</p>}
      </ChartCard>
    </div>
  );
}

function SeniorDash({ d, first }: any) {
  const k = d.kpis, c = d.charts;
  return (
    <div className="space-y-6">
      <Header title={`Welcome, ${first}`} subtitle="Org-wide oversight and pending approvals." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Instructors" value={k.total} icon={Users} tone="brand" />
        <StatCard label="Pending approvals" value={k.pending} icon={Clock} tone="amber" hint={k.pending ? "Action needed" : "All clear"} />
        <StatCard label="Avg. training" value={`${k.avgTraining}%`} icon={GraduationCap} tone="emerald" />
        <StatCard label="Campuses" value={k.campuses} icon={Building2} tone="cyan" />
      </div>
      {k.pending > 0 && (
        <Link to="/app/requests" className="flex items-center justify-between rounded-xl bg-amber-50 px-5 py-3 text-sm text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
          <span>You have {k.pending} edit request(s) waiting for your decision.</span><span className="font-medium">Review now →</span>
        </Link>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Lifecycle status"><StatusDonut data={c.byStatus} /></ChartCard>
        <ChartCard title="Instructors by campus" className="lg:col-span-2"><CampusBars data={c.byCampus} /></ChartCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Avg. training health"><RadialGauge value={k.avgTraining} label="completion" color="#22c55e" /></ChartCard>
        <ChartCard title="Training completion spread"><CampusBars data={c.trainingBuckets} /></ChartCard>
        <ChartCard title="Manager workload" subtitle="Reportees per manager"><HBar data={c.workload} /></ChartCard>
      </div>
    </div>
  );
}

function CapabilityDash({ d, first }: any) {
  const k = d.kpis, c = d.charts;
  return (
    <div className="space-y-6">
      <Header title={`Welcome, ${first}`} subtitle="Your reportees at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My reportees" value={k.total} icon={Users} tone="brand" />
        <StatCard label="My open requests" value={k.pending} icon={Clock} tone="amber" />
        <StatCard label="Avg. training" value={`${k.avgTraining}%`} icon={GraduationCap} tone="emerald" />
        <StatCard label="Deadlines (30d)" value={d.deadlines?.length || 0} icon={CalendarClock} tone="pink" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Reportee status"><StatusDonut data={c.byStatus} /></ChartCard>
        <ChartCard title="Training progress by reportee" subtitle="Primary track % complete" className="lg:col-span-2">
          <HBar data={c.reporteeProgress} max={100} color="#22c55e" height={Math.max(160, (c.reporteeProgress?.length || 1) * 34)} />
        </ChartCard>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Team training health"><RadialGauge value={k.avgTraining} label="avg completion" /></ChartCard>
        <ChartCard title="Upcoming deadlines" subtitle="Track deadlines in next 30 days" className="lg:col-span-2">
          {d.deadlines?.length ? (
            <ul className="divide-y divide-slate-100">
              {d.deadlines.map((x: any) => (
                <li key={x.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link to={`/app/instructors/${x.id}`} className="font-medium text-brand-700 hover:underline">{x.name}</Link>
                  <span className="text-xs text-slate-400">{new Date(x.date).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No deadlines in the next 30 days.</p>}
        </ChartCard>
      </div>
      <Link to="/app/instructors" className="block rounded-xl bg-brand-50 px-5 py-3 text-sm font-medium text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100">View and manage all your reportees →</Link>
    </div>
  );
}

function InstructorDash({ d, first }: any) {
  if (!d.me) return <div className="card p-8"><h1 className="text-xl font-bold">Welcome, {first}</h1><p className="mt-1 text-sm text-slate-500">No instructor profile is linked to your account yet. Please contact your Operations Admin.</p></div>;
  const me = d.me;
  return (
    <div className="space-y-6">
      <Header title={`Welcome, ${first}`} subtitle="Your profile summary." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Status" value={LIFECYCLE_LABEL[me.status] || me.status} icon={Activity} tone="brand" />
        <StatCard label="Training" value={`${me.training}%`} icon={GraduationCap} tone="emerald" />
        <StatCard label="Review score" value={me.review ?? "—"} icon={Star} tone="amber" />
        <StatCard label="Campus" value={me.campus || "—"} icon={CalendarClock} tone="cyan" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="My training completion"><RadialGauge value={me.training} label="primary track" color="#22c55e" /></ChartCard>
        <ChartCard title="My details">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
            {[["Employee ID", me.employeeId], ["Primary track", me.track || "—"], ["Deadline", me.deadline || "—"], ["Manager", me.manager || "—"]].map(([l, v]) => (
              <div key={l as string}><dt className="text-xs text-slate-400">{l}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </ChartCard>
      </div>
      <Link to={`/app/instructors/${me.id}`} className="block rounded-xl bg-brand-50 px-5 py-3 text-sm font-medium text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100">Open my full profile →</Link>
    </div>
  );
}
