import Link from "next/link";
import { Users, Building2, GraduationCap, UserMinus, ArrowRight } from "lucide-react";
import StatCard from "./StatCard.js";
import ChartCard from "./ChartCard.js";
import { StatusDonut, CampusBars, HBar, RadialGauge, TrendArea } from "@/components/DashboardCharts.js";
import RemindersButton from "@/components/RemindersButton.js";

// Ops Admin — org-wide operational analytics.
export default function AdminDashboard({ name, kpis, charts, recent }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {name}</h1>
          <p className="text-sm text-slate-500">Organization-wide analytics across all NIAT campuses.</p>
        </div>
        <RemindersButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total instructors" value={kpis.total} icon={Users} tone="brand" />
        <StatCard label="Campuses" value={kpis.campuses} icon={Building2} tone="cyan" />
        <StatCard label="Avg. training" value={`${kpis.avgTraining}%`} icon={GraduationCap} tone="emerald" />
        <StatCard label="Exited / offboarding" value={kpis.exiting} icon={UserMinus} tone="rose" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Lifecycle status" subtitle="Distribution across stages" className="lg:col-span-1">
          <StatusDonut data={charts.status} />
        </ChartCard>
        <ChartCard title="Instructors by campus" className="lg:col-span-2">
          <CampusBars data={charts.campus} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Avg. training health" subtitle="Mean completion %">
          <RadialGauge value={kpis.avgTraining} label="completion" color="#22c55e" />
        </ChartCard>
        <ChartCard title="Training completion spread" subtitle="Instructors per band">
          <CampusBars data={charts.trainingBuckets} />
        </ChartCard>
        <ChartCard title="Capability Manager workload" subtitle="Reportees per manager">
          <HBar data={charts.workload} />
        </ChartCard>
      </div>

      <ChartCard title="Joining trend" subtitle="New instructor records over the last 6 months">
        <TrendArea data={charts.joins} label="joined" />
      </ChartCard>

      <ChartCard
        title="Recent activity"
        action={<Link href="/app/audit" className="text-sm text-brand-600 hover:underline">Audit log <ArrowRight className="inline h-3 w-3" /></Link>}
      >
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{r.actorName}</span>{" "}
                  <span className="text-slate-500">{r.action.replace(/_/g, " ").toLowerCase()}</span>{" "}
                  {r.fieldName && <span className="text-slate-700">· {r.fieldName}</span>}{" "}
                  {r.instructorName && <span className="text-slate-400">on {r.instructorName}</span>}
                </span>
                <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}
