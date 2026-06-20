import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean; // red confirm button (default true — most uses are deletes)
}
interface PromptOptions {
  title?: string;
  message?: ReactNode;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  required?: boolean;   // disable confirm until non-empty
  multiline?: boolean;  // render a textarea instead of an input
}
type Confirm = (opts?: ConfirmOptions) => Promise<boolean>;
type Prompt = (opts?: PromptOptions) => Promise<string | null>;

interface DialogCtx { confirm: Confirm; prompt: Prompt }
const Ctx = createContext<DialogCtx>(null as any);

type State =
  | { kind: "none" }
  | ({ kind: "confirm" } & ConfirmOptions)
  | ({ kind: "prompt" } & PromptOptions);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "none" });
  const [value, setValue] = useState("");
  const resolver = useRef<(v: any) => void>();

  const confirm = useCallback<Confirm>((opts = {}) => {
    setState({ kind: "confirm", ...opts });
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const prompt = useCallback<Prompt>((opts = {}) => {
    setValue(opts.defaultValue || "");
    setState({ kind: "prompt", ...opts });
    return new Promise<string | null>((resolve) => { resolver.current = resolve; });
  }, []);

  const finish = useCallback((result: any) => {
    setState({ kind: "none" });
    resolver.current?.(result);
    resolver.current = undefined;
  }, []);

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}

      {state.kind === "confirm" && (() => {
        const danger = state.danger !== false;
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => finish(false)}>
            <div className="card w-full max-w-sm p-0" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-3 px-5 pt-5">
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${danger ? "bg-rose-100 text-rose-600" : "bg-brand-100 text-brand-600"}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-slate-900">{state.title || "Are you sure?"}</h2>
                  {state.message != null && <p className="mt-1 text-sm text-slate-600">{state.message}</p>}
                </div>
                <button onClick={() => finish(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex justify-end gap-2 px-5 pb-5 pt-5">
                <button onClick={() => finish(false)} className="btn btn-ghost btn-sm">{state.cancelText || "Cancel"}</button>
                <button autoFocus onClick={() => finish(true)} className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`}>{state.confirmText || "Delete"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {state.kind === "prompt" && (() => {
        const trimmed = value.trim();
        const canSubmit = !state.required || trimmed.length > 0;
        const submit = () => { if (canSubmit) finish(value); };
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => finish(null)}>
            <div className="card w-full max-w-md p-0" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
                <h2 className="font-semibold text-slate-900">{state.title || "Enter a value"}</h2>
                <button onClick={() => finish(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
              </div>
              <div className="px-5 py-4">
                {state.message != null && <p className="mb-2 text-sm text-slate-600">{state.message}</p>}
                {state.multiline ? (
                  <textarea autoFocus className="input min-h-[90px]" placeholder={state.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
                ) : (
                  <input autoFocus className="input" placeholder={state.placeholder} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 pb-5">
                <button onClick={() => finish(null)} className="btn btn-ghost btn-sm">{state.cancelText || "Cancel"}</button>
                <button onClick={submit} disabled={!canSubmit} className="btn btn-primary btn-sm disabled:opacity-50">{state.confirmText || "Save"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx).confirm;
export const usePrompt = () => useContext(Ctx).prompt;
