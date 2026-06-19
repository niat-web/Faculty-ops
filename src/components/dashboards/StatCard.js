// Compact KPI card used across role dashboards.
const TONES = {
  brand: "text-brand-600 bg-brand-50",
  emerald: "text-emerald-600 bg-emerald-50",
  amber: "text-amber-600 bg-amber-50",
  pink: "text-pink-600 bg-pink-50",
  cyan: "text-cyan-600 bg-cyan-50",
  rose: "text-rose-600 bg-rose-50",
  slate: "text-slate-600 bg-slate-100",
};

export default function StatCard({ label, value, icon: Icon, tone = "brand", hint }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      {Icon && <div className={`rounded-xl p-3 ${TONES[tone]}`}><Icon className="h-6 w-6" /></div>}
      <div className="min-w-0">
        <div className="text-2xl font-bold">{value}</div>
        <div className="truncate text-xs text-slate-500">{label}</div>
        {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}
