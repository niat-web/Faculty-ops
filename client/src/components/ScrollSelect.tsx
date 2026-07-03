import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export type Option = { value: string; label: string };

// A dropdown whose OPEN menu is capped at ~7 rows and then scrolls — something a native
// <select> popup can't do (the browser controls its height). Rendered in a portal with
// fixed positioning so it never gets clipped by table/drawer overflow containers.
const ROW_PX = 38;       // approx height of one option row
const MAX_ROWS = 7;      // show ~7 rows, scroll the rest
const MAX_MENU = ROW_PX * MAX_ROWS; // ≈ 266px

export default function ScrollSelect({
  value, onChange, options, placeholder = "— select —", disabled, autoOpen, onClose, className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  autoOpen?: boolean;
  onClose?: () => void;            // fired when the menu closes WITHOUT a selection
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pickedRef = useRef(false);  // distinguishes "closed after picking" from "dismissed"
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  const selected = options.find((o) => o.value === value);

  // Position the portal menu relative to the trigger (flips above if there's no room below).
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const placeAbove = below < 200 && above > below;
    const maxHeight = Math.min(MAX_MENU, Math.max(120, placeAbove ? above : below));
    const width = Math.max(r.width, 190);
    setPos(placeAbove
      ? { left: r.left, width, bottom: window.innerHeight - r.top + 4, maxHeight }
      : { left: r.left, width, top: r.bottom + 4, maxHeight });
  };

  useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line */ }, [open]);
  useEffect(() => { if (autoOpen) setOpen(true); /* eslint-disable-next-line */ }, []);

  // Close on outside click / Escape / scroll / resize.
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); if (!pickedRef.current) onClose?.(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    // Keep the fixed menu aligned to its trigger on scroll/resize. We must NOT close here —
    // scrolling INSIDE the menu also fires this (capture phase), which would dismiss it mid-scroll.
    const reposition = (e?: Event) => {
      if (e && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return; // ignore the menu's own scroll
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
  }, [open, onClose]);

  function pick(v: string) { pickedRef.current = true; onChange(v); setOpen(false); }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={className || "input flex w-full items-center justify-between gap-2 text-left"}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-slate-400"}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="z-[60] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.value || "__empty"}
              type="button"
              onClick={() => pick(o.value)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${o.value === value ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700"}`}
            >
              <span className="truncate">{o.label || <span className="text-slate-400">{placeholder}</span>}</span>
              {o.value === value && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
