import Link from "next/link";
import { Users, Clock, GraduationCap, Building2, ArrowRight } from "lucide-react";
import StatCard from "./StatCard.js";
import ChartCard from "./ChartCard.js";
import { StatusDonut, CampusBars, HBar, RadialGauge } from "@/components/DashboardCharts.js";

// Senior Manager — org-wide view with an approvals focus.
export default function SeniorManagerDashboard({ name, kpis, charts }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {name}</h1>
        <p className="text-sm text-slate-500">Org-wide oversight and pending approvals.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Instructors" value={kpis.total} icon={Users} tone="brand" />
        <StatCard label="Pending approvals" value={kpis.pending} icon={Clock} tone="amber"
          hint={kpis.pending ? "Action needed" : "All clear"} />
        <StatCard label="Avg. training" value={`${kpis.avgTraining}%`} icon={GraduationCap} tone="emerald" />
        <StatCard label="Campuses" value={kpis.campuses} icon={Building2} tone="cyan" />
      </div>

      {kpis.pending > 0 && (
        <Link href="/app/requests" className="flex items-center justify-between rounded-xl bg-amber-50 px-5 py-4 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
          <span className="text-sm font-medium">You have {kpis.pending} edit request(s) waiting for your decision.</span>
          <span className="flex items-center gap-1 text-sm font-semibold">Review now <ArrowRight className="h-4 w-4" /></span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Lifecycle status" className="lg:col-span-1"><StatusDonut data={charts.status} /></ChartCard>
        <ChartCard title="Instructors by campus" className="lg:col-span-2"><CampusBars data={charts.campus} /></ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Avg. training health"><RadialGauge value={kpis.avgTraining} label="completion" color="#22c55e" /></ChartCard>
        <ChartCard title="Training completion spread"><CampusBars data={charts.trainingBuckets} /></ChartCard>
        <ChartCard title="Manager workload" subtitle="Reportees per manager"><HBar data={charts.workload} /></ChartCard>
      </div>
    </div>
  );
}
