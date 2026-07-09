import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users2, GitBranch, GitPullRequest, Bell, UserCog, ScrollText, BarChart3, BookOpen, Award, LogOut, ChevronRight, ChevronDown, UserCircle, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen, Database } from "lucide-react";
import { useAuth, ROLE_LABEL } from "../auth";
import { api } from "../api";
import Logo, { Wordmark } from "./Logo";

const STAFF = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER"];

// Navigation is grouped into labelled sections for clearer wayfinding. Each section &
// item can be role-gated; empty sections are dropped automatically.
const NAV_SECTIONS: any[] = [
  {
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/my-stats", label: "My Stats", icon: BarChart3, roles: ["INSTRUCTOR"] },
    ],
  },
  {
    label: "Manage",
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
      { to: "/app/requests", label: "Requests", icon: GitPullRequest, roles: STAFF },
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // Sidebar collapse (icons-only) — persisted so it survives reloads.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "1");
  useEffect(() => { localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0"); }, [collapsed]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Wide data-grid pages auto-collapse the sidebar so the table gets full width; the user's
  // previous state is restored when they navigate away (we only undo our OWN auto-collapse).
  const WIDE_ROUTES = ["/app/training", "/app/instructors/master"];
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    const isWide = WIDE_ROUTES.some((r) => location.pathname.startsWith(r));
    if (isWide && !collapsed) { setCollapsed(true); autoCollapsedRef.current = true; }
    else if (!isWide && autoCollapsedRef.current) { setCollapsed(false); autoCollapsedRef.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    let on = true;
    // Only poll the unread badge while the tab is visible, and only every 60s (no idle/background spam).
    const pollCount = () => { if (document.visibilityState === "visible") api.get("/notifications/count").then((r) => on && setUnread(r.count)).catch(() => {}); };
    // Re-check session/role when the user returns to the tab (covers the live role-disable case) — not on a timer.
    const onFocus = () => { if (document.visibilityState === "visible") { pollCount(); refresh(); } };
    pollCount();
    const t = setInterval(pollCount, 60000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { on = false; clearInterval(t); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
    // Key on the user ID only — refresh() replaces the user object, and depending on the whole
    // object here would re-run this effect on every refresh (the cause of the request storm).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Close the profile menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  // During logout `user` briefly becomes null before navigation — render nothing rather than crash.
  if (!user) return null;
  const go = (to: string) => { setMenuOpen(false); navigate(to); };

  // Filter sections + items by the signed-in role; drop empty sections.
  const sections = NAV_SECTIONS
    .filter((s) => !s.roles || s.roles.includes(user.role))
    .map((s) => ({ ...s, items: s.items.filter((n: any) => !n.roles || n.roles.includes(user.role)) }))
    .filter((s) => s.items.length);

  const renderItem = (n: any) => {
    if (n.children) {
      const children = n.children.filter((c: any) => !c.roles || c.roles.includes(user.role));
      const childActive = children.some((c: any) => location.pathname.startsWith(c.to));
      const open = openGroups[n.label] ?? childActive; // auto-open when a child is active
      // Collapsed: a single icon button that expands the sidebar and opens this group.
      if (collapsed) {
        return (
          <button key={n.label} onClick={() => { setCollapsed(false); setOpenGroups((g) => ({ ...g, [n.label]: true })); }} title={n.label} className={`nav-link w-full justify-center px-0 ${childActive ? "nav-link-active" : ""}`}>
            <n.icon className="h-5 w-5" />
          </button>
        );
      }
      return (
        <div key={n.label}>
          <button onClick={() => setOpenGroups((g) => ({ ...g, [n.label]: !open }))} className={`nav-link w-full text-left ${childActive ? "nav-link-active" : ""}`}>
            <n.icon className="h-4 w-4" /> <span className="flex-1">{n.label}</span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          </button>
          {/* Animated expand/collapse via grid-rows trick (no fixed height needed). */}
          <div className={`grid transition-all duration-200 ${open ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="space-y-1 border-l border-slate-200 pl-3">
                {children.map((c: any) => (
                  <NavLink key={c.to} to={c.to} end={c.end} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{c.label}</NavLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <NavLink key={n.to} to={n.to} end={n.end} title={collapsed ? n.label : undefined} className={({ isActive }) => `nav-link ${collapsed ? "justify-center px-0" : ""} ${isActive ? "nav-link-active" : ""}`}>
        <n.icon className="h-4 w-4 shrink-0" /> {!collapsed && <span className="flex-1">{n.label}</span>}
      </NavLink>
    );
  };

  return (
    // Full-height shell: the sidebar stays fixed; only <main> scrolls.
    <div className="flex h-screen overflow-hidden">
      <aside className={`flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white py-4 transition-all duration-200 ${collapsed ? "w-16 px-2" : "w-60 px-3"}`}>
        {collapsed ? (
          <div className="mb-6 flex flex-col items-center gap-3">
            <button onClick={() => setCollapsed(false)} title="Expand sidebar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <PanelLeftOpen className="h-5 w-5" />
            </button>
            <Link to="/app" title="FacultyOps"><Logo size={32} className="shrink-0 drop-shadow-sm" /></Link>
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-between gap-2 px-2">
            {/* Shared FacultyOps wordmark lockup (F monogram + gradient "acultyOps"). */}
            <Link to="/app" className="overflow-hidden" title="FacultyOps">
              <Wordmark logoSize={38} />
            </Link>
            <button onClick={() => setCollapsed(true)} title="Collapse sidebar" className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
        )}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {sections.map((s, i) => (
            <div key={s.label || `sec-${i}`} className={i > 0 ? "pt-3" : ""}>
              {s.label && (
                collapsed
                  ? <div className="mx-2 mb-1 border-t border-slate-100" />
                  : <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</div>
              )}
              <div className="space-y-1">{s.items.map(renderItem)}</div>
            </div>
          ))}
        </nav>

        {/* Profile row → opens a popup menu to the right with Edit profile / Notifications / Logout */}
        <div ref={menuRef} className="relative mt-4 border-t border-slate-100 pt-3">
          <button onClick={() => setMenuOpen((o) => !o)} title={collapsed ? user.name : undefined} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 ${collapsed ? "justify-center" : ""} ${menuOpen ? "bg-slate-100" : ""}`}>
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-purple-600 font-bold text-white shadow-sm">
              {user.name.charAt(0).toUpperCase()}
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500" />}
            </span>
            {!collapsed && <>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{user.name}</div><div className="text-[11px] text-slate-400">{ROLE_LABEL[user.role]}</div></div>
              <ChevronRight className={`h-4 w-4 text-slate-400 transition ${menuOpen ? "rotate-90" : ""}`} />
            </>}
          </button>

          {menuOpen && (
            <div className="absolute bottom-0 left-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-[11px] text-slate-400">{user.email}</div></div>
              <button onClick={() => go("/app/account")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><UserCircle className="h-4 w-4 text-slate-400" /> My Account</button>
              <button onClick={() => go("/app/notifications")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                <Bell className="h-4 w-4 text-slate-400" /> <span className="flex-1">Notifications</span>
                {unread > 0 && <span className="chip chip-status">{unread}</span>}
              </button>
              {user.role === "OPS_ADMIN" && (
                <button onClick={() => go("/app/data")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Database className="h-4 w-4 text-slate-400" /> Data</button>
              )}
              <div className="my-1 border-t border-slate-100" />
              <button onClick={async () => { setMenuOpen(false); await logout(); navigate("/login"); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"><LogOut className="h-4 w-4" /> Logout</button>
            </div>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto px-6 py-5">{children}</main>
    </div>
  );
}
