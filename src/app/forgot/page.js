import Link from "next/link";
import Logo from "@/components/Logo.js";

export default function ForgotPage({ searchParams }) {
  const sent = searchParams?.sent;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8"><Logo subtitle /></div>
        <h1 className="text-2xl font-bold">Reset password</h1>
        <p className="mt-1 text-sm text-slate-500">Enter your email and we'll send a reset link.</p>

        {sent ? (
          <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </div>
        ) : (
          <form action="/api/auth/forgot" method="post" className="mt-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" className="input" placeholder="you@niat.edu" required />
            </div>
            <button className="btn btn-primary w-full" type="submit">Send reset link</button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="text-brand-600 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
