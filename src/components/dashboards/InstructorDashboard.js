import Link from "next/link";
import { GraduationCap, Activity, Star, CalendarClock, ArrowRight } from "lucide-react";
import StatCard from "./StatCard.js";
import ChartCard from "./ChartCard.js";
import { RadialGauge } from "@/components/DashboardCharts.js";
import { LIFECYCLE_LABEL } from "@/lib/enums.js";

// Instructor — read-only self view.
export default function InstructorDashboard({ name, me }) {
  if (!me) {
    return (
      <div className="">
        <div className="card p-8 text-center text-slate-500">
          <h1 className="mb-2 text-xl font-bold text-slate-800">Welcome, {name}</h1>
          No instructor profile is linked to your account yet. Please contact your Operations Admin.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {name}</h1>
        <p className="text-sm text-slate-500">Your profile summary.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Status" value={LIFECYCLE_LABEL[me.status] || me.status} icon={Activity} tone="brand" />
        <StatCard label="Training" value={`${me.training}%`} icon={GraduationCap} tone="emerald" />
        <StatCard label="Review score" value={me.review ?? "—"} icon={Star} tone="amber" />
        <StatCard label="Campus" value={me.campus || "—"} icon={CalendarClock} tone="cyan" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="My training completion"><RadialGauge value={me.training} label="primary track" color="#22c55e" /></ChartCard>
        <ChartCard title="My details">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Employee ID</dt><dd className="font-medium">{me.employeeId}</dd></div>
            <div><dt className="text-xs text-slate-400">Primary track</dt><dd className="font-medium">{me.track || "—"}</dd></div>
            <div><dt className="text-xs text-slate-400">Deadline</dt><dd className="font-medium">{me.deadline || "—"}</dd></div>
            <div><dt className="text-xs text-slate-400">Manager</dt><dd className="font-medium">{me.manager || "—"}</dd></div>
          </dl>
        </ChartCard>
      </div>

      <Link href={`/app/instructors/${me.id}`} className="flex items-center justify-between rounded-xl bg-brand-50 px-5 py-4 text-brand-800 ring-1 ring-brand-100 hover:bg-brand-100">
        <span className="text-sm font-medium">Open my full profile</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
