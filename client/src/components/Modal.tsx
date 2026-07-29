import { type CSSProperties, type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { backdropClick } from "../lib/backdropClose";

export default function Modal({ title, description, onClose, children, wide = false, size, flush = false, panelClassName, panelStyle }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  size?: "md" | "lg" | "xl";
  flush?: boolean;
  panelClassName?: string;
  panelStyle?: CSSProperties;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const maxW = size === "xl" ? "max-w-3xl" : size === "lg" || wide ? "max-w-2xl" : "max-w-md";
  const maxH = size === "xl" ? "90vh" : "85vh";
  const showHeader = !!title?.trim();
  const panelRound = flush && !showHeader ? "rounded-xl" : "rounded-lg";

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("button, input, textarea, select, [tabindex]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  useEffect(() => {
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPaddingRight = document.body.style.paddingRight;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.paddingRight = prevBodyPaddingRight;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  const modal = (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/40"
        role="presentation"
        onClick={backdropClick(onClose)}
      />
      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={showHeader ? titleId : undefined}
            className={`relative w-full border border-slate-200 bg-white shadow-lg ${panelRound} ${maxW} ${panelClassName || ""}`}
            style={{ maxHeight: panelStyle?.height ? undefined : maxH, ...panelStyle }}
            onClick={(e) => e.stopPropagation()}
          >
            {showHeader ? (
              <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 id={titleId} className="text-base font-bold text-slate-900">{title}</h2>
                  {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
            <div
              className={`relative ${flush ? "h-full overflow-visible" : "overflow-y-auto px-5 py-4"}`}
              style={!flush && showHeader ? { maxHeight: `calc(${maxH} - 4.5rem)` } : !flush ? { maxHeight: maxH } : undefined}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
