"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, GitPullRequestArrow, Layers,
  Network, History, UserCog, X, UploadCloud, Workflow,
  ChevronRight, User as UserIcon, Settings, LogOut,
} from "lucide-react";
import { ROLE_LABEL } from "@/lib/enums.js";
import Logo from "./Logo.js";

const ICONS = {
  dashboard: LayoutDashboard, instructors: Users, requests: GitPullRequestArrow,
  fields: Layers, mapping: Network, audit: History, users: UserCog, import: UploadCloud, org: Workflow,
};

export default function Sidebar({ user, nav, open, onClose }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed z-40 flex h-full w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/app"><Logo subtitle /></Link>
          <button className="lg:hidden" onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} onClick={onClose} className={`nav-link ${active ? "nav-link-active" : ""}`}>
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Profile footer + fly-out menu */}
        <div className="relative border-t border-slate-200 p-3">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-100 ${menuOpen ? "bg-slate-100" : ""}`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">{user.name}</div>
              <div className="truncate text-xs text-slate-400">{ROLE_LABEL[user.role]}</div>
            </div>
            <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${menuOpen ? "rotate-90" : ""}`} />
          </button>

          {menuOpen && (
            <>
              {/* click-away catcher */}
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute bottom-3 left-full z-50 ml-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-soft">
                <div className="border-b border-slate-100 px-4 py-2.5">
                  <div className="truncate text-sm font-semibold text-slate-800">{user.name}</div>
                  <div className="truncate text-xs text-slate-400">{user.email}</div>
                </div>
                <Link href="/app/profile" onClick={() => { setMenuOpen(false); onClose?.(); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <UserIcon className="h-4 w-4 text-slate-400" /> Edit Profile
                </Link>
                <Link href="/app/settings" onClick={() => { setMenuOpen(false); onClose?.(); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <Settings className="h-4 w-4 text-slate-400" /> Settings
                </Link>
                <div className="my-1 border-t border-slate-100" />
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50">
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
