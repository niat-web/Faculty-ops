import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

export type SearchOption = { value: string; label: string; hint?: string };

const ROW_PX = 44;
const MAX_ROWS = 7;
const MAX_MENU = ROW_PX * MAX_ROWS;

export default function SearchableSelect({
  value,
  onChange,
  options,
  query,
  onQueryChange,
  placeholder = "Search by name…",
  disabled,
  loading,
  hideHints,
  inline,
  listMaxHeight = 220,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SearchOption[];
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  hideHints?: boolean;
  inline?: boolean;
  listMaxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pickedRef = useRef(false);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  const selected = options.find((o) => o.value === value);
  const displayValue = open ? query : (selected ? selected.label : query);

  const filtered = options.filter((o) => {
    if (!o.value) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return o.label.toLowerCase().includes(q) || (o.hint || "").toLowerCase().includes(q);
  });

  const place = () => {
    if (inline) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const placeAbove = below < 180 && above > below;
    const maxHeight = Math.min(MAX_MENU, Math.max(120, placeAbove ? above : below));
    setPos(placeAbove
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight }
      : { left: r.left, width: r.width, top: r.bottom + 4, maxHeight });
  };

  useLayoutEffect(() => { if (open && !inline) place(); }, [open, filtered.length, inline]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      if (!pickedRef.current && selected) onQueryChange(selected.label);
      pickedRef.current = false;
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || wrapRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const reposition = (e?: Event) => {
      if (inline) return;
      if (e && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      place();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, selected, onQueryChange, inline]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    if (selected) onQueryChange("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(v: string, label: string) {
    pickedRef.current = true;
    onChange(v);
    onQueryChange(label);
    setOpen(false);
  }

  function onInputChange(v: string) {
    onQueryChange(v);
    if (value) onChange("");
    if (!open) setOpen(true);
  }

  const listContent = filtered.length ? filtered.map((o) => (
    <button
      key={o.value}
      type="button"
      onClick={() => pick(o.value, o.label)}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${o.value === value ? "bg-brand-50 text-brand-700" : "text-slate-700"}`}
    >
      <span className="min-w-0 truncate font-medium">{o.label}</span>
      {o.value === value && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
    </button>
  )) : (
    <p className="px-3 py-4 text-center text-sm text-slate-400">
      {loading ? "Searching…" : query.trim() ? "No matches found." : "No people available."}
    </p>
  );

  return (
    <div ref={wrapRef} className="relative w-full" data-keep-open>
      <div className={`input flex items-center gap-2 p-0 ${disabled ? "opacity-60" : ""}`}>
        <Search className="pointer-events-none ml-3 h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={displayValue}
          placeholder={placeholder}
          onFocus={openMenu}
          onClick={openMenu}
          onChange={(e) => onInputChange(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent py-2 pr-1 text-sm outline-none ring-0 placeholder:text-slate-400"
        />
        {loading ? (
          <Loader2 className="mr-3 h-4 w-4 shrink-0 animate-spin text-slate-400" />
        ) : (
          <button type="button" tabIndex={-1} disabled={disabled} onClick={() => (open ? setOpen(false) : openMenu())} className="mr-2 shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {open && inline && (
        <div
          ref={menuRef}
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          style={{ maxHeight: listMaxHeight }}
        >
          {listContent}
        </div>
      )}

      {open && !inline && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="z-[60] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.length ? filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value, o.label)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${o.value === value ? "bg-brand-50 text-brand-700" : "text-slate-700"}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{o.label}</span>
                {!hideHints && o.hint && <span className="block truncate text-xs text-slate-400">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
            </button>
          )) : (
            <p className="px-3 py-4 text-center text-sm text-slate-400">
              {loading ? "Searching…" : query.trim() ? "No matches found." : "No people available."}
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
