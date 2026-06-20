import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LabelList, RadialBarChart, RadialBar, AreaChart, Area, Legend,
} from "recharts";

export const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7", "#ef4444", "#14b8a6"];

const TONES: Record<string, string> = {
  brand: "text-brand-600 bg-brand-50", emerald: "text-emerald-600 bg-emerald-50", amber: "text-amber-600 bg-amber-50",
  pink: "text-pink-600 bg-pink-50", cyan: "text-cyan-600 bg-cyan-50", rose: "text-rose-600 bg-rose-50", slate: "text-slate-600 bg-slate-100",
};
const TONE_BAR: Record<string, string> = {
  brand: "bg-brand-500", emerald: "bg-emerald-500", amber: "bg-amber-500", pink: "bg-pink-500", cyan: "bg-cyan-500", rose: "bg-rose-500", slate: "bg-slate-400",
};

export function StatCard({ label, value, icon: Icon, tone = "brand", hint }: { label: string; value: any; icon: any; tone?: string; hint?: string }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${TONES[tone] || TONES.brand}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <div className="text-2xl font-bold">{value}</div>
        <div className="truncate text-xs text-slate-500">{label}</div>
        {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

// Richer SaaS-style KPI tile: icon chip, optional badge, big number, label, optional progress + link.
export function KpiCard({ label, value, icon: Icon, tone = "brand", sub, subTone, progress, to }: {
  label: string; value: any; icon: any; tone?: string; sub?: ReactNode; subTone?: string; progress?: number; to?: string;
}) {
  const inner = (
    <div className="card h-full p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${TONES[tone] || TONES.brand}`}><Icon className="h-5 w-5" /></span>
        {sub != null && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${subTone || "bg-slate-100 text-slate-500"}`}>{sub}</span>}
      </div>
      <div className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 truncate text-sm text-slate-500">{label}</div>
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${TONE_BAR[tone] || TONE_BAR.brand}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

// Slim labelled progress bar (used for inline stats).
export function ProgressBar({ value, tone = "brand" }: { value: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${TONE_BAR[tone] || TONE_BAR.brand}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// Time-of-day greeting header with date + optional right-aligned actions.
export function GreetingHeader({ name, subtitle, actions }: { name: string; subtitle?: string; actions?: ReactNode }) {
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{today}</p>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-900">{greet}, {name} 👋</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ChartCard({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between">
        <div><h2 className="font-semibold">{title}</h2>{subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ h = 260 }: { h?: number }) => <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: h }}>No data yet</div>;

export function StatusDonut({ data, height = 260, onSlice }: { data: any[]; height?: number; onSlice?: (d: any) => void }) {
  if (!data?.length) return <Empty h={height} />;
  const total = data.reduce((a, b) => a + (b.value || 0), 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={2} onClick={onSlice ? (d: any) => onSlice(d?.payload || d) : undefined} className={onSlice ? "cursor-pointer" : ""}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ top: -28 }}>
        <span className="text-2xl font-bold">{total}</span><span className="text-xs text-slate-400">total</span>
      </div>
    </div>
  );
}

export function CampusBars({ data, height = 260, onBar }: { data: any[]; height?: number; onBar?: (d: any) => void }) {
  if (!data?.length) return <Empty h={height} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef2f7" strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={data.length > 6 ? -20 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 50 : 24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
          <Tooltip />
          <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} onClick={onBar ? (d: any) => onBar(d?.payload || d) : undefined} className={onBar ? "cursor-pointer" : ""}><LabelList dataKey="value" position="top" className="fill-slate-400" style={{ fontSize: 11 }} /></Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBar({ data, color = "#6366f1", max, height = 260 }: { data: any[]; color?: string; max?: number; height?: number }) {
  if (!data?.length) return <Empty h={height} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
          <XAxis type="number" hide domain={max ? [0, max] : undefined} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]}><LabelList dataKey="value" position="right" className="fill-slate-500" style={{ fontSize: 11 }} /></Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RadialGauge({ value, label, color = "#6366f1", height = 200 }: { value: number; label?: string; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value: v, fill: color }]} startAngle={90} endAngle={-270}>
          <RadialBar background dataKey="value" cornerRadius={20} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{Math.round(v)}%</span>{label && <span className="text-xs text-slate-400">{label}</span>}
      </div>
    </div>
  );
}

export function TrendArea({ data, color = "#6366f1", height = 240 }: { data: any[]; color?: string; height?: number }) {
  if (!data?.length) return <Empty h={height} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs><linearGradient id="ta" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#eef2f7" strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
          <Tooltip />
          <Area type="monotone" dataKey="value" stroke={color} fill="url(#ta)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
