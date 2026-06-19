"use client";

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, X, Info } from "lucide-react";

const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

let nextId = 1;

export default function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((message, type = "success") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  const confirm = useCallback((opts) =>
    new Promise((resolve) => { resolver.current = resolve; setDialog({ kind: "confirm", ...opts }); }), []);
  const prompt = useCallback((opts) =>
    new Promise((resolve) => { resolver.current = resolve; setDialog({ kind: "prompt", value: opts.defaultValue || "", ...opts }); }), []);

  const close = (result) => { setDialog(null); resolver.current?.(result); resolver.current = null; };

  // Esc closes the dialog (accessibility).
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e) => { if (e.key === "Escape") close(dialog.kind === "prompt" ? null : false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  return (
    <UICtx.Provider value={{ toast, confirm, prompt }}>
      {children}

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-soft ${
              t.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800"
              : t.type === "info" ? "border-brand-200 bg-brand-50 text-brand-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {t.type === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              : t.type === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0" />
              : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="max-w-xs">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      {/* Confirm / prompt dialog */}
      {dialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
          onClick={() => close(dialog.kind === "prompt" ? null : false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{dialog.title || "Are you sure?"}</h3>
            {dialog.message && <p className="mt-1 text-sm text-slate-500">{dialog.message}</p>}
            {dialog.kind === "prompt" && (
              <input autoFocus className="input mt-4" placeholder={dialog.placeholder || ""}
                defaultValue={dialog.value}
                onChange={(e) => (dialog.value = e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") close(dialog.value); }} />
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => close(dialog.kind === "prompt" ? null : false)}>Cancel</button>
              <button
                className={`btn btn-sm ${dialog.danger ? "btn-danger" : "btn-primary"}`}
                onClick={() => close(dialog.kind === "prompt" ? dialog.value : true)}
              >
                {dialog.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </UICtx.Provider>
  );
}
