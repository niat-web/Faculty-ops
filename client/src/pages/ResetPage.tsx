import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const setup = params.get("setup") === "1";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  async function setPw(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { await api.post("/auth/reset", { token, password }); setDone(true); }
    catch (e: any) { setErr(e.message); }
  }
  async function forgot(e: React.FormEvent) {
    e.preventDefault(); await api.post("/auth/forgot", { email }); setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold">{setup ? "Set your password" : "Reset password"}</h1>
        {done ? (
          <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Password set. <Link to="/login" className="font-medium underline">Sign in</Link>.</div>
        ) : token ? (
          <form onSubmit={setPw} className="mt-6 space-y-4">
            <div><label className="label">New password</label><input className="input" type="password" minLength={8} placeholder="At least 8 chars, letters + numbers" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            <button className="btn btn-primary w-full">Save password</button>
          </form>
        ) : sent ? (
          <div className="mt-6 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">If that email exists, a reset link has been sent (valid 1 hour).</div>
        ) : (
          <form onSubmit={forgot} className="mt-6 space-y-4">
            <div><label className="label">Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <button className="btn btn-primary w-full">Send reset link</button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-slate-500"><Link to="/login" className="text-brand-600 hover:underline">Back to sign in</Link></p>
      </div>
    </div>
  );
}
