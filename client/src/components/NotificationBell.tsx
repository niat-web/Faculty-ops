import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, Mail, Trash2, CheckCheck } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";

function relTime(t: any) {
  const ms = new Date(t).getTime();
  if (!t || isNaN(ms)) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell() {
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    api.get("/notifications?limit=7").then((r) => { setItems(r.items || []); setCount(r.unread || 0); }).catch(() => {});
  }
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    load();
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function setRead(n: any, read: boolean) {
    setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read } : x)));
    setCount((c) => Math.max(0, c + (read ? -1 : 1) * (n.read === read ? 0 : 1)));
    try { await api.patch(`/notifications/${n.id}`, { read }); } catch (e: any) { toast.error(e.message); load(); }
  }
  async function remove(n: any) {
    setItems((xs) => xs.filter((x) => x.id !== n.id));
    if (!n.read) setCount((c) => Math.max(0, c - 1));
    try { await api.del(`/notifications/${n.id}`); } catch (e: any) { toast.error(e.message); load(); }
  }
  async function markAll() {
    setItems((xs) => xs.map((x) => ({ ...x, read: true }))); setCount(0);
    try { await api.post("/notifications/read"); } catch (e: any) { toast.error(e.message); load(); }
  }
  function openItem(n: any) {
    if (!n.read) setRead(n, true);
    setOpen(false);
    if (n.link) nav(n.link);
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Notifications" aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
        <Bell className="h-5 w-5" />
        {count > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800">Notifications {count > 0 && <span className="ml-1 text-xs font-normal text-slate-400">({count} unread)</span>}</span>
            {count > 0 && <button onClick={markAll} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><CheckCheck className="h-3.5 w-3.5" /> Mark all</button>}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length ? items.map((n) => (
              <div key={n.id} className={`group relative flex items-start gap-2.5 px-4 py-2.5 transition hover:bg-slate-50 ${n.read ? "" : "bg-brand-50/40"}`}>
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-slate-100 text-slate-400" : "bg-brand-100 text-brand-600"}`}><Bell className="h-3.5 w-3.5" /></span>
                <button onClick={() => openItem(n)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium text-slate-800">{n.title}</div>
                  {n.body && <div className="line-clamp-2 text-xs text-slate-500">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-slate-400">{relTime(n.createdAt)}</div>
                </button>
                {/* hover actions: toggle read / delete */}
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => setRead(n, !n.read)} title={n.read ? "Mark as unread" : "Mark as read"} className="rounded-md bg-white p-1 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:text-brand-600">
                    {n.read ? <Mail className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => remove(n)} title="Delete" className="rounded-md bg-white p-1 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )) : <div className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up.</div>}
          </div>

          <button onClick={() => { setOpen(false); nav("/app/notifications"); }} className="block w-full border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-slate-50">
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
