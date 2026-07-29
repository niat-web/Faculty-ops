import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { backdropClick } from "../lib/backdropClose";

export default function Modal({ title, description, onClose, children, wide = false }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("button, input, textarea, select, [tabindex]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10"
      role="presentation"
      onClick={backdropClick(onClose)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full rounded-lg border border-slate-200 bg-white shadow-lg ${wide ? "max-w-2xl" : "max-w-md"}`}
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-bold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="max-h-[calc(85vh-4rem)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
