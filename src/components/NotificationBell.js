"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

// Polls the unread count so the badge stays fresh without a page reload.
export default function NotificationBell({ initial = 0 }) {
  const [unread, setUnread] = useState(initial);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await fetch("/api/notifications/count", { cache: "no-store" });
        if (!alive) return;
        const j = await r.json();
        if (typeof j.unread === "number") setUnread(j.unread);
      } catch {}
    }
    const id = setInterval(poll, 30000);
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  return (
    <Link href="/app/notifications" className="relative rounded-lg p-2 hover:bg-slate-100" title="Notifications">
      <Bell className="h-5 w-5 text-slate-500" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
