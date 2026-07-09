import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Check, Mail, Trash2 } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";
import { SkeletonList } from "../components/scaffold";

export default function NotificationsPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  function load() { api.get("/notifications").then((r) => { setData(r); setErr(null); }).catch((e) => setErr(e.message)); }
  useEffect(() => { load(); }, []);

  const items: any[] = data?.items || [];
  const unread = data?.unread ?? 0;
  function patchLocal(id: string, changes: any) { setData((d: any) => d ? { ...d, items: d.items.map((x: any) => x.id === id ? { ...x, ...changes } : x) } : d); }

  async function markAll() {
    setData((d: any) => d ? { ...d, items: d.items.map((x: any) => ({ ...x, read: true })), unread: 0 } : d);
    try { await api.post("/notifications/read"); } catch (e: any) { toast.error(e.message || "Couldn't mark all read"); load(); }
  }
  async function setRead(n: any, read: boolean) {
    patchLocal(n.id, { read });
    setData((d: any) => d ? { ...d, unread: Math.max(0, d.unread + (read ? -1 : 1) * (n.read === read ? 0 : 1)) } : d);
    try { await api.patch(`/notifications/${n.id}`, { read }); } catch (e: any) { toast.error(e.message); load(); }
  }
  async function remove(n: any) {
    setData((d: any) => d ? { ...d, items: d.items.filter((x: any) => x.id !== n.id), unread: n.read ? d.unread : Math.max(0, d.unread - 1) } : d);
    try { await api.del(`/notifications/${n.id}`); } catch (e: any) { toast.error(e.message); load(); }
  }
  function openItem(n: any) { if (!n.read) setRead(n, true); if (n.link) nav(n.link); }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Notifications</h1><p className="text-sm text-slate-500">{unread} unread</p></div>
        {unread > 0 && <button onClick={markAll} className="btn btn-ghost btn-sm"><CheckCheck className="h-4 w-4" /> Mark all read</button>}
      </div>
      {err && <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={load} className="btn btn-ghost btn-sm">Retry</button></div>}

      <div className="card divide-y divide-slate-100">
        {!data && <div className="p-5"><SkeletonList rows={6} /></div>}
        {items.map((n) => (
          <div key={n.id} className={`group relative flex items-start gap-3 px-5 py-3 transition hover:bg-slate-50 ${n.read ? "" : "bg-brand-50/40"}`}>
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-slate-100 text-slate-400" : "bg-brand-100 text-brand-600"}`}><Bell className="h-4 w-4" /></span>
            <button onClick={() => openItem(n)} className="min-w-0 flex-1 text-left">
              <div className="text-sm font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-slate-500">{n.body}</div>}
              <div className="text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
            </button>
            {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500 group-hover:hidden" />}
            {/* hover actions: mark read/unread + delete */}
            <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              <button onClick={() => setRead(n, !n.read)} title={n.read ? "Mark as unread" : "Mark as read"} className="rounded-md bg-white p-1.5 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:text-brand-600">
                {n.read ? <Mail className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
              <button onClick={() => remove(n)} title="Delete" className="rounded-md bg-white p-1.5 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {data && !items.length && <div className="px-5 py-10 text-center text-slate-400">You're all caught up.</div>}
      </div>
    </div>
  );
}
