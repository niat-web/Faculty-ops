import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";

export default function NotificationsPage() {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  function load() { api.get("/notifications").then((r) => { setData(r); setErr(null); }).catch((e) => setErr(e.message)); }
  useEffect(load, []);

  async function markAll() { try { await api.post("/notifications/read"); load(); } catch (e: any) { toast.error(e.message || "Couldn't mark all read"); } }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Notifications</h1><p className="text-sm text-slate-500">{data?.unread ?? 0} unread</p></div>
        <button onClick={markAll} className="btn btn-ghost btn-sm"><CheckCheck className="h-4 w-4" /> Mark all read</button>
      </div>
      {err && <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={load} className="btn btn-ghost btn-sm">Retry</button></div>}

      <div className="card divide-y divide-slate-100">
        {data?.items?.map((n: any) => {
          const body = (
            <div className={`flex items-start gap-3 px-5 py-3 ${n.read ? "" : "bg-brand-50/40"}`}>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-slate-100 text-slate-400" : "bg-brand-100 text-brand-600"}`}><Bell className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{n.title}</div>
                {n.body && <div className="text-xs text-slate-500">{n.body}</div>}
                <div className="text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
              {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
            </div>
          );
          return n.link ? <Link key={n.id} to={n.link} className="block hover:bg-slate-50">{body}</Link> : <div key={n.id}>{body}</div>;
        })}
        {data && !data.items?.length && <div className="px-5 py-10 text-center text-slate-400">You're all caught up.</div>}
      </div>
    </div>
  );
}
