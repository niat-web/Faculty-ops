import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { readPending2FA } from "@/lib/auth.js";
import Logo from "@/components/Logo.js";

export default async function TwoFactorPage({ searchParams }) {
  const uid = await readPending2FA();
  if (!uid) redirect("/login");
  const error = searchParams?.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo subtitle /></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
          <div className="mb-2 inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-600"><ShieldCheck className="h-5 w-5" /></div>
          <h1 className="text-2xl font-bold">Two-step verification</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the 6-digit code from your authenticator app.</p>

          {error && (
            <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error === "locked" ? "Too many attempts. Try again in 15 minutes." : "Invalid code. Please try again."}
            </div>
          )}

          <form action="/api/auth/2fa-verify" method="post" className="mt-6 space-y-4">
            <input
              name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required
              maxLength={6} placeholder="000000"
              className="w-full rounded-xl border border-slate-300 bg-white py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
            <button className="btn btn-primary w-full" type="submit">Verify</button>
          </form>
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">
          Lost your device? Ask an Operations Admin to reset your 2FA.
        </p>
      </div>
    </div>
  );
}
