import { useEffect, useState } from "react";
import { Navigate, useNavigate, Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../auth";
import Logo from "../components/Logo";
import { api, API_BASE } from "../api";

const GOOGLE_ERR: Record<string, string> = {
  google_unconfigured: "Google sign-in isn't configured.",
  google_failed: "Google sign-in failed. Please try again.",
  google_noaccount: "No active account matches that Google address. Ask an admin to add you.",
  role_disabled: "Access for your role has been disabled by an administrator. Please contact your admin.",
};

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);
  const [params] = useSearchParams();

  useEffect(() => {
    api.get("/auth/google/status").then((r) => setGoogleOn(r.enabled)).catch(() => {});
    const e = params.get("error"); if (e) setErr(GOOGLE_ERR[e] || "Sign-in failed.");
  }, []);

  if (user) return <Navigate to="/app" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const r = await login(email, password, token || undefined);
      if (r.twoFactorRequired) { setNeeds2fa(true); setBusy(false); return; }
      navigate("/app");
    }
    catch (e: any) { setErr(e.message || "Login failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="relative min-h-screen bg-slate-50">
      {/* Brand — pinned to the top-left of the page */}
      <div className="absolute left-6 top-6 z-10 flex items-center gap-2">
        <Logo size={40} className="shrink-0" />
        <span><span className="block text-lg font-bold leading-tight text-slate-900">FacultyOps</span><span className="block text-[10px] uppercase tracking-wide text-slate-400">NIAT Campus Suite</span></span>
      </div>

      {/* Sign-in form — centered in the page */}
      <div className="flex min-h-screen items-center justify-center px-6 py-24">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back — sign in to continue.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div><label className="label">Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus disabled={needs2fa} /></div>
          <div><label className="label">Password</label>
            <div className="relative">
              <input className="input pr-10" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={needs2fa} />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>
          {needs2fa && <div><label className="label">Authentication code</label><input className="input tracking-widest" inputMode="numeric" maxLength={6} placeholder="123456" value={token} onChange={(e) => setToken(e.target.value)} required autoFocus /><p className="mt-1 text-xs text-slate-400">Enter the 6-digit code from your authenticator app.</p></div>}
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : needs2fa ? "Verify & sign in" : "Sign in"}</button>
        </form>
        {googleOn && !needs2fa && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" /></div>
            <a href={`${API_BASE}/api/auth/google`} className="btn btn-ghost w-full">
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Continue with Google
            </a>
          </>
        )}
        <p className="mt-4 text-center text-sm text-slate-500"><Link to="/reset" className="text-brand-600 hover:underline">Forgot / set password</Link></p>
        </div>
      </div>
    </div>
  );
}
