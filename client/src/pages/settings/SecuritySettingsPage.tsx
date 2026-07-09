import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, LockKeyhole } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { SkeletonField } from "../../components/scaffold";

type Security = { passwordMinLength: number; requireComplexity: boolean; maxLoginAttempts: number; lockoutMinutes: number };

export default function SecuritySettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<Security | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/settings/security").then((r) => setS(r.security)).catch((e) => toast.error(e.message)); }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    try { const r = await api.patch("/settings/security", s); setS(r.security); toast.success("Security policy saved."); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const num = (k: keyof Security, lo: number, hi: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!s) return;
    const n = parseInt(e.target.value, 10);
    setS({ ...s, [k]: isNaN(n) ? ("" as any) : Math.min(hi, Math.max(lo, n)) });
  };

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><KeyRound className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Password policy</h2></div>
        <p className="mb-5 text-sm text-slate-500">Applies to every new or changed password — on invites, resets, admin edits and self-service.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Minimum length</label>
            {s ? <input className="input" type="number" min={6} max={64} value={s.passwordMinLength} onChange={num("passwordMinLength", 6, 64)} /> : <SkeletonField />}
            <p className="mt-1 text-xs text-slate-400">Between 6 and 64 characters.</p>
          </div>
          <div className="flex items-end">
            <label className="flex w-full items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-2.5">
              <span>
                <span className="block text-sm font-medium text-slate-800">Require letters &amp; numbers</span>
                <span className="block text-xs text-slate-500">Reject passwords that are all letters or all digits.</span>
              </span>
              <button
                type="button" role="switch" aria-checked={!!s?.requireComplexity} disabled={!s}
                onClick={() => s && setS({ ...s, requireComplexity: !s.requireComplexity })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${s?.requireComplexity ? "bg-brand-600" : "bg-slate-300"} ${!s ? "opacity-50" : ""}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${s?.requireComplexity ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </label>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Login protection</h2></div>
        <p className="mb-5 text-sm text-slate-500">Throttles brute-force attempts. After too many failures, that account/IP is temporarily locked.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Max failed attempts</label>
            {s ? <input className="input" type="number" min={3} max={50} value={s.maxLoginAttempts} onChange={num("maxLoginAttempts", 3, 50)} /> : <SkeletonField />}
            <p className="mt-1 text-xs text-slate-400">Failures before a lockout (3–50).</p>
          </div>
          <div>
            <label className="label">Lockout duration (minutes)</label>
            {s ? <input className="input" type="number" min={1} max={1440} value={s.lockoutMinutes} onChange={num("lockoutMinutes", 1, 1440)} /> : <SkeletonField />}
            <p className="mt-1 text-xs text-slate-400">How long the lock lasts (1–1440).</p>
          </div>
        </div>
      </div>

      <div className="card flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500"><ShieldCheck className="h-4 w-4 text-brand-600" /> Two-factor authentication is managed per-user under <b className="text-slate-700">My Account</b>.</div>
        <button disabled={busy || !s} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}
