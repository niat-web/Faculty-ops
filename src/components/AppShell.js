"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import Sidebar from "./Sidebar.js";
import Logo from "./Logo.js";
import NotificationBell from "./NotificationBell.js";
import UIProvider from "./UIProvider.js";

export default function AppShell({ user, nav, unread, children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Top bar (instructor search + notification bell) is only on the Dashboard.
  const isDashboard = pathname === "/app";
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} nav={nav} open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* On non-dashboard pages the bar only exists on mobile (for the menu button). */}
        <header className={`h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-6 ${isDashboard ? "flex" : "flex lg:hidden"}`}>
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5 text-slate-500" />
          </button>
          <div className="lg:hidden"><Logo compact /></div>

          {isDashboard && (
            <>
              {/* Global search */}
              <form action="/app/instructors" method="get" className="relative hidden max-w-md flex-1 sm:block">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  name="q"
                  placeholder="Search instructors by name, ID, campus…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
                />
              </form>

              <div className="flex-1 sm:hidden" />
              <NotificationBell initial={unread} />
            </>
          )}
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4 lg:px-6 lg:py-5">
          <UIProvider>{children}</UIProvider>
        </main>
      </div>
    </div>
  );
}
