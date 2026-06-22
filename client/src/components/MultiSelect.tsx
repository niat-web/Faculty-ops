import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

// Filter dropdown that supports BOTH single and multiple selection (checkboxes). Value is a
// string[] — pick one for a single filter, or several for an OR filter. Drop-in for the drawers.
export default function MultiSelect({ values, options, onChange, placeholder = "All", searchable = true }: {
  values: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const label = values.length === 0 ? placeholder
    : values.length === 1 ? (options.find((o) => o.value === values[0])?.label ?? values[0])
      : `${values.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="input flex h-9 w-full items-center justify-between gap-2 text-left text-sm">
        <span className={`truncate ${values.length ? "text-slate-800" : "text-slate-400"}`}>{label}</span>
        <span className="flex items-center gap-1">
          {values.length > 0 && <X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" onClick={(e) => { e.stopPropagation(); onChange([]); }} />}
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {searchable && (
            <div className="relative border-b border-slate-100 p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input autoFocus className="input h-8 pl-7 text-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {shown.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No matches</div>}
            {shown.map((o) => {
              const on = values.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50">
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
