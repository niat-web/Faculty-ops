// Titled card wrapper for a chart.
export default function ChartCard({ title, subtitle, action, children, className = "" }) {
  return (
    <div className={`card p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
