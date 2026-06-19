import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-center">
      <div className="text-6xl font-extrabold text-brand-600">404</div>
      <p className="text-slate-500">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/app" className="btn btn-primary">Back to dashboard</Link>
    </div>
  );
}
