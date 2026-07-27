import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users2, GitBranch, GitPullRequest, Bell, UserCog, ScrollText,
  BarChart3, BookOpen, Award, LogOut, ChevronDown, UserCircle, Settings as SettingsIcon,
  Database, Menu, X,
} from "lucide-react";
import { useAuth, ROLE_LABEL } from "../auth";
import { api } from "../api";
import { Wordmark } from "./Logo";

const STAFF = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER"];
const SIDEBAR_W = 240;

const NAV_SECTIONS: any[] = [
  {
    label: "Main",
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/my-stats", label: "My Stats", icon: BarChart3, roles: ["INSTRUCTOR"] },
    ],
  },
  {
    label: "Operations",
    roles: STAFF,
    items: [
      { label: "Instructors", icon: Users2, roles: STAFF, children: [
        { to: "/app/instructors/master", label: "Instructor Master" },
        { to: "/app/instructors/exited", label: "Instructor Exited" },
        { to: "/app/instructors/moved", label: "Instructor Moved" },
        { to: "/app/instructors/roles", label: "Roles", roles: ["OPS_ADMIN", "SENIOR_MANAGER"] },
      ] },
      { to: "/app/training", label: "Training Stats", icon: BookOpen, roles: STAFF },
      { label: "Contribution", icon: Award, roles: ["OPS_ADMIN", "SENIOR_MANAGER"], children: [
        { to: "/app/contribution/distribution", label: "Contribution Distribution" },
        { to: "/app/contribution/campuswise", label: "Campuswise Instructors" },
        { to: "/app/contribution/managers", label: "Capability Manager Distribution" },
      ] },
      { to: "/app/org", label: "Org Chart", icon: GitBranch, roles: ["OPS_ADMIN", "SENIOR_MANAGER"] },
      { to: "/app/requests", label: "Requests", icon: GitPullRequest, roles: STAFF, badge: true },
    ],
  },
  {
    label: "Administration",
    roles: ["OPS_ADMIN", "SENIOR_MANAGER"],
    items: [
      { to: "/app/users", label: "Users", icon: UserCog, roles: ["OPS_ADMIN"] },
      { to: "/app/audit", label: "Audit Log", icon: ScrollText, roles: ["OPS_ADMIN", "SENIOR_MANAGER"] },
      { to: "/app/settings", label: "Settings", icon: SettingsIcon, roles: ["OPS_ADMIN"] },
    ],
  },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    let on = true;
    const pollCount = () => { if (document.visibilityState === "visible") api.get("/notifications/count").then((r) => on && setUnread(r.count)).catch(() => {}); };
    const onFocus = () => { if (document.visibilityState === "visible") { pollCount(); refresh(); } };
    pollCount();
    const t = setInterval(pollCount, 60000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { on = false; clearInterval(t); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  if (!user) return null;
  const go = (to: string) => { setMenuOpen(false); setMobileOpen(false); navigate(to); };

  const sections = NAV_SECTIONS
    .filter((s) => !s.roles || s.roles.includes(user.role))
    .map((s) => ({ ...s, items: s.items.filter((n: any) => !n.roles || n.roles.includes(user.role)) }))
    .filter((s) => s.items.length);

  const renderItem = (n: any) => {
    if (n.children) {
      const children = n.children.filter((c: any) => !c.roles || c.roles.includes(user.role));
      const childActive = children.some((c: any) => location.pathname.startsWith(c.to));
      const open = openGroups[n.label] ?? childActive;
      return (
        <div key={n.label}>
          <button
            onClick={() => setOpenGroups((g) => ({ ...g, [n.label]: !open }))}
            className={`nav-link w-full text-left ${childActive ? "nav-link-active" : ""}`}
          >
            <n.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            <span className="flex-1">{n.label}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} strokeWidth={1.75} />
          </button>
          <div className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="space-y-0.5 py-1">
                {children.map((c: any) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    end={c.end}
                    className={({ isActive }) => `nav-sublink ${isActive ? "nav-sublink-active" : ""}`}
                  >
                    {c.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <NavLink
        key={n.to}
        to={n.to}
        end={n.end}
        className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}
      >
        <n.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
        <span className="flex-1">{n.label}</span>
        {n.badge && unread > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>
        )}
      </NavLink>
    );
  };

  const sidebar = (
    <aside
      className="flex h-full flex-col bg-slate-900"
      style={{ width: SIDEBAR_W }}
    >
      <div className="border-b border-slate-700/80 px-4 py-4">
        <Link to="/app" title="FacultyOps">
          <Wordmark logoSize={32} dark />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {sections.map((s, i) => (
          <div key={s.label || `sec-${i}`} className={i > 0 ? "pt-4" : ""}>
            {s.label && (
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
            )}
            <div className="space-y-0.5">{s.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>

      <div ref={menuRef} className="relative border-t border-slate-700/80 p-3">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-800 ${menuOpen ? "bg-slate-800" : ""}`}
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-700 text-sm font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-brand-500" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{ROLE_LABEL[user.role]}</div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${menuOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
        </button>

        {menuOpen && (
          <div className="absolute bottom-full left-3 right-3 z-50 mb-2 overflow-hidden rounded-lg border border-slate-600 bg-slate-800 py-1 shadow-xl">
            <div className="border-b border-slate-700 px-3 py-2">
              <div className="truncate text-sm font-medium text-white">{user.name}</div>
              <div className="truncate text-[11px] text-slate-400">{user.email}</div>
            </div>
            <button onClick={() => go("/app/account")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60">
              <UserCircle className="h-4 w-4 text-slate-400" strokeWidth={1.75} /> My Account
            </button>
            <button onClick={() => go("/app/notifications")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60">
              <Bell className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
              <span className="flex-1">Notifications</span>
              {unread > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>}
            </button>
            {user.role === "OPS_ADMIN" && (
              <button onClick={() => go("/app/data")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60">
                <Database className="h-4 w-4 text-slate-400" strokeWidth={1.75} /> Data
              </button>
            )}
            <div className="my-1 border-t border-slate-700" />
            <button
              onClick={async () => { setMenuOpen(false); await logout(); navigate("/login"); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700/60"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} /> Logout
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
        <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <Wordmark logoSize={28} dark={false} />
      </header>

      {/* Mobile overlay + sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex shadow-xl">
            {sidebar}
            <button onClick={() => setMobileOpen(false)} className="absolute right-[-44px] top-3 rounded-md bg-white/10 p-2 text-white" aria-label="Close menu">
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-30 hidden md:block">{sidebar}</div>

      {/* Main content */}
      <main
        className="min-h-screen bg-white pt-14 md:pt-0"
        style={{ paddingLeft: undefined }}
      >
        <div className="md:pl-[240px]">
          <div className="px-4 py-5 sm:px-6 lg:px-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
