import { type ReactNode } from "react";
import { X } from "lucide-react";

export default function Modal({ title, description, onClose, children, wide = false }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10" onMouseDown={onClose}>
      <div
        className={`w-full rounded-lg border border-slate-200 bg-white shadow-lg ${wide ? "max-w-2xl" : "max-w-md"}`}
        style={{ maxHeight: "85vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="max-h-[calc(85vh-4rem)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
