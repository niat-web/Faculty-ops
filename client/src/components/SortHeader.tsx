import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

// 3-state column sort: none → asc → desc → none. Server-side (the page passes sort/dir to its API),
// so it sorts across ALL rows, not just the current page. No layout change — just a clickable header.
export type SortState = { sort: string; dir: "asc" | "desc" | "" };

export function useSort(initialSort = "", initialDir: "asc" | "desc" | "" = "") {
  const [state, setState] = useState<SortState>({ sort: initialSort, dir: initialDir });
  const toggle = (key: string) =>
    setState((s) =>
      s.sort !== key ? { sort: key, dir: "asc" }
        : s.dir === "asc" ? { sort: key, dir: "desc" }
          : { sort: "", dir: "" } // third click → back to default
    );
  return { ...state, toggle, setSort: setState };
}

// Drop-in replacement for a <th>. `k` is the sort key sent to the server; omit it for a non-sortable column.
export function SortHeader({ label, k, state, onToggle, className = "", align = "left" }: {
  label: React.ReactNode; k?: string; state: SortState; onToggle: (k: string) => void; className?: string; align?: "left" | "right" | "center";
}) {
  if (!k) return <th className={className}>{label}</th>;
  const active = state.sort === k;
  const just = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={className}>
      <button type="button" onClick={() => onToggle(k)} className={`inline-flex w-full items-center gap-1 ${just} hover:text-slate-700`}>
        <span>{label}</span>
        {active
          ? (state.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5 text-brand-600" /> : <ChevronDown className="h-3.5 w-3.5 text-brand-600" />)
          : <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />}
      </button>
    </th>
  );
}
