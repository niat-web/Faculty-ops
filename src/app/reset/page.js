import Link from "next/link";
import Logo from "@/components/Logo.js";

export default function ResetPage({ searchParams }) {
  const token = searchParams?.token || "";
  const error = searchParams?.error;
  const badToken = error === "invalid" || error === "expired";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8"><Logo subtitle /></div>
        <h1 className="text-2xl font-bold">Set a new password</h1>

        {badToken ? (
          <div className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            This reset link is invalid or has expired. <Link href="/forgot" className="font-medium underline">Request a new one</Link>.
          </div>
        ) : (
          <form action="/api/auth/reset" method="post" className="mt-6 space-y-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <label className="label">New password</label>
              <input name="password" type="password" className="input" placeholder="At least 8 chars, letters + numbers" minLength={8} required />
            </div>
            {error && !badToken && <p className="text-sm text-rose-600">{error}</p>}
            <button className="btn btn-primary w-full" type="submit">Update password</button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="text-brand-600 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
