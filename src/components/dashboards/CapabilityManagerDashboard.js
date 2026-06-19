import Link from "next/link";
import { Users, Clock, GraduationCap, CalendarClock, ArrowRight } from "lucide-react";
import StatCard from "./StatCard.js";
import ChartCard from "./ChartCard.js";
import { StatusDonut, HBar, RadialGauge } from "@/components/DashboardCharts.js";

// Capability Manager — scoped to their own reportees.
export default function CapabilityManagerDashboard({ name, kpis, charts, deadlines }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {name}</h1>
        <p className="text-sm text-slate-500">Your reportees at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My reportees" value={kpis.total} icon={Users} tone="brand" />
        <StatCard label="My open requests" value={kpis.pending} icon={Clock} tone="amber" />
        <StatCard label="Avg. training" value={`${kpis.avgTraining}%`} icon={GraduationCap} tone="emerald" />
        <StatCard label="Deadlines (30d)" value={deadlines.length} icon={CalendarClock} tone="pink" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Reportee status" className="lg:col-span-1"><StatusDonut data={charts.status} /></ChartCard>
        <ChartCard title="Training progress by reportee" subtitle="Primary track % complete" className="lg:col-span-2">
          <HBar data={charts.reporteeProgress} max={100} color="#22c55e" height={Math.max(160, charts.reporteeProgress.length * 34)} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Team training health"><RadialGauge value={kpis.avgTraining} label="avg completion" /></ChartCard>
        <ChartCard title="Upcoming deadlines" subtitle="Track deadlines in next 30 days" className="lg:col-span-2">
          {deadlines.length === 0 ? (
            <p className="text-sm text-slate-400">No deadlines in the next 30 days.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {deadlines.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/app/instructors/${d.id}`} className="font-medium text-brand-700 hover:underline">{d.name}</Link>
                  <span className="text-slate-500">{new Date(d.date).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <Link href="/app/instructors" className="flex items-center justify-between rounded-xl bg-brand-50 px-5 py-4 text-brand-800 ring-1 ring-brand-100 hover:bg-brand-100">
        <span className="text-sm font-medium">View and manage all your reportees</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
