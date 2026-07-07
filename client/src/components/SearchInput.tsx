import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useDebouncedValue } from "../hooks";

// Debounced search box that owns its OWN keystroke state, so typing re-renders only this leaf input — not
// the parent grid (which previously re-rendered every row/cell on each keystroke). It reports the DEBOUNCED
// value via onSearch, so search behaviour is identical to a parent-owned `useDebouncedValue`.
export default function SearchInput({ onSearch, placeholder = "Search…", className = "relative w-56 sm:w-64" }: {
  onSearch: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const cb = useRef(onSearch);
  cb.current = onSearch; // always call the latest callback without re-subscribing the effect
  useEffect(() => { cb.current(dq); }, [dq]);
  return (
    <div className={className}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input h-9 pl-9 text-sm" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
  );
}
