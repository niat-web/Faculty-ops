import { useEffect, useState } from "react";
import { Navigate, useNavigate, Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../auth";
import { api, API_BASE } from "../api";
import { Wordmark } from "../components/Logo";

const REMEMBER_KEY = "fo_remember_email";
const REMEMBER_DAYS = 30;

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
  const [remember, setRemember] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleOn, setGoogleOn] = useState(() => localStorage.getItem("fo_google") !== "0");
  const [params] = useSearchParams();

  useEffect(() => {
    api.get("/auth/google/status").then((r) => { setGoogleOn(r.enabled); localStorage.setItem("fo_google", r.enabled ? "1" : "0"); }).catch(() => {});
    const e = params.get("error"); if (e) setErr(GOOGLE_ERR[e] || "Sign-in failed.");
    try {
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (raw) {
        const { email: saved, exp } = JSON.parse(raw);
        if (saved && exp && Date.now() < exp) { setEmail(saved); setRemember(true); }
        else localStorage.removeItem(REMEMBER_KEY);
      }
    } catch { /* ignore */ }
  }, [params]);

  if (user) return <Navigate to="/app" replace />;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null); setBusy(true);
    try {
      const r = await login(email, password, token || undefined);
      if (r.twoFactorRequired) { setNeeds2fa(true); setBusy(false); return; }
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, exp: Date.now() + REMEMBER_DAYS * 86400000 }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      navigate("/app");
    }
    catch (e: any) { setErr(e.message || "Login failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="relative min-h-screen bg-slate-100">
      <div className="absolute left-6 top-6 md:left-10 md:top-10">
        <Wordmark logoSize={36} dark={false} />
      </div>

      <div className="flex min-h-screen items-center justify-center px-6 py-20">
        <div className="w-full max-w-[420px] rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-500">Please enter your details</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="login-email" className="label">Email address</label>
              <input
                id="login-email"
                className="input h-11"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={needs2fa}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="label">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  className="input h-11 pr-10"
                  type={showPw ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={needs2fa}
                  autoComplete="current-password"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  {showPw ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                </button>
              </div>
            </div>

            {needs2fa && (
              <>
                <div>
                  <label htmlFor="login-2fa" className="label">Authentication code</label>
                  <input
                    id="login-2fa"
                    className="input h-11 tracking-widest"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-slate-500">Enter the 6-digit code from your authenticator app.</p>
                </div>
                <button type="button" onClick={() => { setNeeds2fa(false); setToken(""); setErr(null); }} className="text-sm font-semibold text-brand-600 hover:underline">
                  Use a different account
                </button>
              </>
            )}

            {!needs2fa && (
              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  Remember for 30 days
                </label>
                <Link to="/reset" className="text-sm font-semibold text-brand-600 hover:underline">Forgot password</Link>
              </div>
            )}

            {err && <p className="text-sm text-red-600">{err}</p>}

            <button type="submit" className="btn btn-primary h-11 w-full text-base" disabled={busy}>
              {busy ? "Signing in…" : needs2fa ? "Verify & sign in" : "Sign in"}
            </button>
          </form>

          {googleOn && !needs2fa && (
            <a
              href={`${API_BASE}/api/auth/google`}
              className="btn btn-outline mt-4 h-11 w-full text-sm font-semibold"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
              </svg>
              Sign in with Google
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
