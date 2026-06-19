"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, Legend, RadialBarChart, RadialBar, PolarAngleAxis,
  AreaChart, Area, CartesianGrid,
} from "recharts";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7", "#ef4444", "#14b8a6"];

function Empty({ h = 240, label = "No data yet" }) {
  return <div style={{ height: h }} className="flex items-center justify-center text-sm text-slate-400">{label}</div>;
}

// Donut with a total in the center.
export function StatusDonut({ data, height = 260 }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (!total) return <Empty h={height} />;
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[40%] -translate-y-1/2 text-center">
        <div className="text-2xl font-bold">{total}</div>
        <div className="text-xs text-slate-400">total</div>
      </div>
    </div>
  );
}

export function CampusBars({ data, height = 260 }) {
  if (!data.length) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 14, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#6366f1">
          <LabelList dataKey="value" position="top" className="fill-slate-400" style={{ fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Horizontal bars — good for "per manager" / "per reportee" rankings.
export function HBar({ data, height = 260, color = "#6366f1", max }) {
  if (!data.length) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <XAxis type="number" hide domain={max ? [0, max] : undefined} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={color}>
          <LabelList dataKey="value" position="right" className="fill-slate-400" style={{ fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Single-value radial gauge (e.g. average training %).
export function RadialGauge({ value, label, height = 200, color = "#6366f1" }) {
  const data = [{ name: label, value: Math.max(0, Math.min(100, value)) }];
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={20} fill={color} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold">{Math.round(value)}%</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export function TrendArea({ data, height = 240, color = "#6366f1", label = "value" }) {
  if (!data.length) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Area type="monotone" dataKey="value" name={label} stroke={color} strokeWidth={2} fill="url(#ga)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
