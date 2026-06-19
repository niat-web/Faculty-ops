import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import { ShieldCheck, GitBranch, History, AlertCircle, CheckCircle2, Lock } from "lucide-react";
import Logo from "@/components/Logo.js";
import LoginForm from "@/components/LoginForm.js";
import ThemeToggle from "@/components/ThemeToggle.js";

const HIGHLIGHTS = [
  { icon: ShieldCheck, text: "Role-based access — managers see only their reportees" },
  { icon: GitBranch, text: "Approval workflow with reason & proof on every change" },
  { icon: History, text: "Immutable audit trail — who changed what, when and why" },
];

export default async function LoginPage({ searchParams }) {
  const user = await getCurrentUser();
  if (user) redirect("/app");
  const error = searchParams?.error;
  const reset = searchParams?.reset;
  const ERROR_MESSAGES = {
    locked: "Too many attempts. Please try again in 15 minutes.",
    google_unconfigured: "Google sign-in isn't set up yet — use your email and password.",
    google_failed: "Google sign-in failed. Please try again.",
    google_noaccount: "No FacultyOps account matches that Google email. Contact your Ops Admin.",
  };
  const errorMessage = error ? (ERROR_MESSAGES[error] || "Invalid email or password.") : null;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ───────────────────────── Left brand panel ───────────────────────── */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white dark:from-brand-800 dark:via-brand-900 dark:to-slate-950 lg:block">
        {/* subtle grid texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)", backgroundSize: "44px 44px" }} />
        {/* decorative glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />

        {/* logo pinned top */}
        <div className="absolute left-12 top-10 z-10"><Logo light subtitle /></div>

        {/* vertically-centered content block */}
        <div className="relative flex h-full items-center px-12">
          <div className="max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100 ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Instructor lifecycle, in one place
            </span>
            <h2 className="mt-6 text-[2.6rem] font-extrabold leading-[1.08] tracking-tight">
              One profile per instructor.
              <span className="block text-brand-200">Controlled. Audited. Complete.</span>
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-brand-100/90">
              Manage profiles, approvals and the full instructor lifecycle across every
              NIAT campus — from joining to exit.
            </p>

            <ul className="mt-9 space-y-4">
              {HIGHLIGHTS.map((h) => (
                <li key={h.text} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                    <h.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-brand-50/90">{h.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* stats pinned bottom */}
        <div className="absolute bottom-10 left-12 z-10 flex items-center gap-6 text-sm text-brand-200/80">
          <span><strong className="text-white">600+</strong> instructors</span>
          <span className="h-1 w-1 rounded-full bg-brand-300/60" />
          <span><strong className="text-white">20+</strong> campuses</span>
          <span className="h-1 w-1 rounded-full bg-brand-300/60" />
          <span><strong className="text-white">100%</strong> audited</span>
        </div>
      </div>

      {/* ───────────────────────── Right form panel ───────────────────────── */}
      <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10 dark:bg-slate-950">
        <ThemeToggle className="absolute right-5 top-5" />

        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex justify-center lg:hidden"><Logo subtitle /></div>

          <div className="mb-6">
            <h1 className="text-[1.7rem] font-bold tracking-tight text-slate-900 dark:text-white">Welcome back</h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Sign in to your FacultyOps account.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-soft dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            {reset && (
              <div className="mb-5 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Password updated. You can sign in now.</span>
              </div>
            )}
            {errorMessage && (
              <div className="mb-5 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <GoogleIcon /> Continue with Google
            </a>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">or sign in with email</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>

            <LoginForm />
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400 dark:text-slate-500">
            <Lock className="h-3 w-3" />
            Secure sign-in · Access is managed by your Operations Admin
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
