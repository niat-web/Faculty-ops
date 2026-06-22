import { type ReactNode } from "react";
import { Link } from "react-router-dom";

// Shared palette + semantic lifecycle colors.
export const PALETTE = ["#6366f1", "#22c55e", "#f59e0b", "#06b6d4", "#ec4899", "#a855f7", "#ef4444", "#14b8a6"];
export const STATUS_COLOR: Record<string, string> = {
  ONBOARDING: "#f59e0b", IN_TRAINING: "#6366f1", CONFIRMED: "#22c55e", TRANSFER: "#06b6d4",
  EXIT_IN_PROGRESS: "#fb923c", EXITED: "#ef4444", REHIRED: "#a855f7",
};

/* ── Panel: the base section card with a compact header ── */
export function Panel({ title, sub, icon: Icon, action, children, className = "", pad = true }: {
  title?: string; sub?: string; icon?: any; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <div className={`card flex flex-col ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-2 px-5 pt-4">
          <div className="flex items-center gap-2">
            {Icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon className="h-4 w-4" /></span>}
            <div><h3 className="text-sm font-semibold text-slate-800">{title}</h3>{sub && <p className="text-[11px] text-slate-400">{sub}</p>}</div>
          </div>
          {action}
        </div>
      )}
      <div className={`flex-1 ${pad ? "p-5" : ""} ${title ? "pt-4" : ""}`}>{children}</div>
    </div>
  );
}

/* ── MetricTile: compact KPI with delta chip + sparkline ── */
const ACCENT: Record<string, { chip: string; stroke: string }> = {
  brand: { chip: "bg-brand-50 text-brand-600", stroke: "#6366f1" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", stroke: "#22c55e" },
  amber: { chip: "bg-amber-50 text-amber-600", stroke: "#f59e0b" },
  rose: { chip: "bg-rose-50 text-rose-600", stroke: "#ef4444" },
  cyan: { chip: "bg-cyan-50 text-cyan-600", stroke: "#06b6d4" },
  pink: { chip: "bg-pink-50 text-pink-600", stroke: "#ec4899" },
};

export function MetricTile({ label, value, icon: Icon, tone = "brand", delta, spark, to, footer }: {
  label: string; value: ReactNode; icon: any; tone?: string; delta?: number; spark?: number[]; to?: string; footer?: ReactNode;
}) {
  const a = ACCENT[tone] || ACCENT.brand;
  const inner = (
    <div className="card h-full p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.chip}`}><Icon className="h-5 w-5" /></span>
        {delta != null && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${delta >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none tracking-tight text-slate-900">{value}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{label}</div>
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} color={a.stroke} />}
      </div>
      {footer && <div className="mt-2 text-[11px] text-slate-400">{footer}</div>}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

/* ── Sparkline (inline SVG) ── */
export function Sparkline({ data, color = "#6366f1", w = 84, h = 34 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data?.length) return null;
  const max = Math.max(...data, 1), min = Math.min(...data, 0), range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1 || 1)) * w, h - ((v - min) / range) * (h - 4) - 2]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible">
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}

/* ── Ring: SVG progress ring with center content ── */
export function Ring({ value, size = 132, stroke = 12, color = "#22c55e", children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/* ── Donut: SVG multi-segment with center label ── */
export function Donut({ data, size = 168, stroke = 24, center }: { data: { name: string; value: number; color: string }[]; size?: number; stroke?: number; center?: ReactNode }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {data.map((seg, i) => {
          const frac = seg.value / total, dash = frac * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-acc} />;
          acc += dash; return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{center}</div>
    </div>
  );
}

/* ── LegendList: colored rows with value + percentage bar ── */
export function LegendList({ items, total, onItem }: { items: { name: string; value: number; color: string; key?: string }[]; total?: number; onItem?: (it: any) => void }) {
  const sum = (total ?? items.reduce((a, b) => a + b.value, 0)) || 1;
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => {
        const pct = Math.round((it.value / sum) * 100);
        const Row = (
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{it.name}</span>
            <span className="text-sm font-semibold text-slate-800">{it.value}</span>
            <span className="w-9 text-right text-[11px] text-slate-400">{pct}%</span>
          </div>
        );
        return <li key={(it as any).key ?? it.name ?? i}>{onItem ? <button onClick={() => onItem(it)} className="w-full rounded-lg px-1 py-0.5 text-left hover:bg-slate-50">{Row}</button> : Row}</li>;
      })}
    </ul>
  );
}

/* ── Leaderboard: ranked rows with a proportional bar ── */
export function Leaderboard({ items, color = "#6366f1", unit = "", to }: { items: { name: string; value: number; id?: string }[]; color?: string; unit?: string; to?: (it: any) => string }) {
  if (!items?.length) return <Empty />;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((it, i) => {
        const body = (
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-500">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-2"><span className="truncate text-sm text-slate-700">{it.name}</span><span className="shrink-0 text-xs font-semibold text-slate-800">{it.value}{unit}</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color }} /></div>
            </div>
          </div>
        );
        return <li key={(it as any).id ?? it.name ?? i}>{to ? <Link to={to(it)} className="block rounded-lg px-1 py-0.5 hover:bg-slate-50">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

/* ── MiniBars: a proportional vertical column chart (distributions) ── */
export function MiniBars({ data, colors }: { data: { name: string; value: number }[]; colors?: string[] }) {
  if (!data?.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    // items-stretch (not items-end) so each column fills the height and bars scale proportionally.
    <div className="flex items-stretch justify-between gap-3" style={{ height: 180 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-700">{d.value}</span>
          {/* plot area — bar grows from the baseline (x-axis) up to its proportional height */}
          <div className="flex w-full flex-1 items-end justify-center border-b-2 border-slate-200">
            <div
              className="w-full max-w-[52px] rounded-t-md transition-[height] duration-300"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: 4, background: colors?.[i] || PALETTE[i % PALETTE.length] }}
              title={`${d.name}: ${d.value}`}
            />
          </div>
          <span className="text-center text-[11px] leading-tight text-slate-400">{d.name}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ label = "No data yet" }: { label?: string }) {
  return <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-slate-400">{label}</div>;
}

export function Avatar({ name, color }: { name: string; color?: string }) {
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color || "#94a3b8" }}>{(name || "?").charAt(0).toUpperCase()}</span>;
}
