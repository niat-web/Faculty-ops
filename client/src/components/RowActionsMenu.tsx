import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export type RowAction = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  href?: string;          // renders as a link (e.g. document download) instead of a button
  download?: boolean;     // pass through to the <a>
  newTab?: boolean;       // open the link in a new tab
  danger?: boolean;       // red styling (Delete, Remove, …)
  disabled?: boolean;
  title?: string;
};

// Three-dots (kebab) row-actions menu — replaces inline edit/delete icon clusters in tables.
// Rendered in a portal with fixed positioning (same recipe as ScrollSelect) so it never gets
// clipped by overflow-x-auto table wrappers or sticky columns. Right-aligned to the trigger,
// flips above when there's no room below; closes on outside click, Escape, action click, or when
// keyboard focus leaves the menu. Keyboard-operable: opens focused on the first item, ↑/↓ to move.
const MENU_W = 176;

export default function RowActionsMenu({
  actions, label = "Actions", className, onOpenChange,
}: {
  actions: RowAction[];
  label?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void; // lets hover-reveal callers keep the trigger visible while open
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false); // ensures we move focus into the menu exactly once per open
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);

  const close = (returnFocus?: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };
  useEffect(() => { onOpenChange?.(open); /* eslint-disable-next-line */ }, [open]);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuH = actions.length * 36 + 10; // approx: rows + padding
    const below = window.innerHeight - r.bottom - 8;
    const placeAbove = below < menuH && r.top > below;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(placeAbove ? { right, bottom: window.innerHeight - r.top + 4 } : { right, top: r.bottom + 4 });
  };

  useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line */ }, [open]);
  // On open, move focus into the menu ONCE so keyboard users land on the actions (not stranded at
  // page end). Guarded by focusedRef so later reposition()→setPos() (fired on scroll/resize) doesn't
  // yank focus back to the first item mid-navigation.
  useEffect(() => {
    if (!open) { focusedRef.current = false; return; }
    if (focusedRef.current) return;
    const first = menuRef.current?.querySelector<HTMLElement>("[data-menuitem]:not([aria-disabled='true'])");
    if (first) { first.focus(); focusedRef.current = true; }
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    // Close when focus leaves both the trigger and the menu (Tab-away → no orphaned open menu).
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    // Keep the fixed menu glued to its trigger while the page/table scrolls.
    const reposition = (e?: Event) => {
      if (e && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      place();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line
  }, [open]);

  // ↑/↓ arrow navigation between items within the open menu.
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[data-menuitem]:not([aria-disabled='true'])") || []);
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  if (!actions.length) return null;

  const itemCls = (a: RowAction) =>
    `flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition outline-none focus:bg-slate-100 ${
      a.disabled ? "cursor-not-allowed text-slate-300" : a.danger ? "text-rose-600 hover:bg-rose-50 focus:bg-rose-50" : "text-slate-700 hover:bg-slate-50"
    }`;
  const iconCls = (a: RowAction) => `h-4 w-4 shrink-0 ${a.disabled ? "text-slate-300" : a.danger ? "text-rose-500" : "text-slate-400"}`;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={className || `rounded-lg p-1.5 transition ${open ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          style={{ position: "fixed", right: pos.right, top: pos.top, bottom: pos.bottom, width: MENU_W }}
          className="z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {actions.map((a, i) => {
            const Icon = a.icon;
            const inner = <>{Icon && <Icon className={iconCls(a)} />}<span className="truncate">{a.label}</span></>;
            if (a.href && !a.disabled) {
              return (
                <a key={i} href={a.href} download={a.download} title={a.title} role="menuitem" data-menuitem tabIndex={-1} className={itemCls(a)}
                  {...(a.newTab ? { target: "_blank", rel: "noreferrer" } : {})} onClick={() => close()}>
                  {inner}
                </a>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                data-menuitem
                tabIndex={-1}
                aria-disabled={a.disabled || undefined}
                disabled={a.disabled}
                title={a.title}
                className={itemCls(a)}
                onClick={(e) => { e.stopPropagation(); close(); a.onClick?.(); }}
              >
                {inner}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
