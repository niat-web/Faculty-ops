import Link from "next/link";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Notification } from "@/models/index.js";
import NotificationActions from "@/components/NotificationActions.js";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  await connectDB();
  const items = await Notification.find({ userId: user.id }).sort({ createdAt: -1 }).limit(100).lean();
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-slate-500">{unread} unread</p>
        </div>
        {unread > 0 && <NotificationActions />}
      </div>
      <div className="card divide-y divide-slate-100">
        {items.length === 0 && <p className="px-6 py-10 text-center text-sm text-slate-400">No notifications.</p>}
        {items.map((n) => (
          <Link
            key={String(n._id)}
            href={n.link || "/app"}
            className={`block px-6 py-4 hover:bg-slate-50 ${n.read ? "" : "bg-brand-50/40"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{n.title}</span>
              <span className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
