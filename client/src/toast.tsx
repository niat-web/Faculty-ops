import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; text: string; ms: number }
interface ToastCtx { show: (text: string, kind?: Kind, ms?: number) => void; success: (t: string, ms?: number) => void; error: (t: string, ms?: number) => void; info: (t: string, ms?: number) => void }

const Ctx = createContext<ToastCtx>(null as any);
let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((text: string, kind: Kind = "info", ms = 4500) => {
    const id = seq++;
    setToasts((t) => [...t, { id, kind, text, ms }]);
    setTimeout(() => remove(id), ms);
  }, [remove]);
  const value: ToastCtx = { show, success: (t, ms) => show(t, "success", ms), error: (t, ms) => show(t, "error", ms), info: (t, ms) => show(t, "info", ms) };

  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  const tone: Record<Kind, string> = { success: "border-emerald-200 bg-emerald-50 text-emerald-800", error: "border-rose-200 bg-rose-50 text-rose-800", info: "border-brand-200 bg-brand-50 text-brand-800" };
  const bar: Record<Kind, string> = { success: "bg-emerald-400", error: "bg-rose-400", info: "bg-brand-400" };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const I = Icon[t.kind];
          return (
            <div key={t.id} className={`relative flex items-start gap-2 overflow-hidden rounded-lg border px-3 py-2 text-sm shadow-card animate-[toastin_0.22s_ease-out] ${tone[t.kind]}`}>
              <I className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{t.text}</span>
              <button onClick={() => remove(t.id)} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
              {/* Auto-dismiss countdown — a bar that shrinks left→right over the toast's lifetime. */}
              <div className={`absolute inset-x-0 bottom-0 h-0.5 origin-left ${bar[t.kind]}`} style={{ animation: `toastbar ${t.ms}ms linear forwards` }} />
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
