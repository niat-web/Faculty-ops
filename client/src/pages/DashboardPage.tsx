import { Suspense, lazy, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { isAbort } from "../hooks";
import { api } from "../api";
import { DashboardSkeleton } from "../components/skeletons";

// The recharts-backed role dashboards live in their own chunk and are lazy-loaded, so recharts is NOT part
// of the initial paint. Until this chunk (and the live BigQuery data) are ready we render a skeleton.
const DashboardViews = lazy(() => import("./DashboardViews"));

export default function DashboardPage() {
  const { user } = useAuth();
  // BigQuery-BLOCKING, single render (identical to Instructor Stats): fetch the LIVE dashboard once and WAIT.
  // No Mongo-first payload, no cache, no SWR, no background merge, no second render. The skeleton stays on
  // screen until BigQuery returns, then we render the latest numbers exactly once.
  const [d, setD] = useState<any>(undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get("/dashboard?live=1", { signal: ac.signal })
      .then((r) => { if (!ac.signal.aborted) setD(r); })
      .catch((e) => { if (!isAbort(e)) setErr(e.message || "Failed to load"); });
    return () => ac.abort();
  }, []);

  if (err && !d) return <div className="card p-6 text-sm text-rose-600">{err}</div>;
  if (!d) return <DashboardSkeleton />;

  const first = (user!.name || "").split(" ")[0];
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardViews d={d} user={user!} first={first} />
    </Suspense>
  );
}
