import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { GraduationCap, LayoutDashboard, Users2, Layers, Network, GitBranch, GitPullRequest, Bell, UserCog, ScrollText, BarChart3, BookOpen, LogOut, ChevronRight, UserCircle } from "lucide-react";
import { useAuth, ROLE_LABEL } from "../auth";
import { api } from "../api";

const STAFF = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER"];
const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/my-stats", label: "My Stats", icon: BarChart3, roles: ["INSTRUCTOR"] },
  { to: "/app/instructors", label: "Instructors", icon: Users2, roles: STAFF },
  { to: "/app/training", label: "Instructors Training Stats", icon: BookOpen, roles: STAFF },
  { to: "/app/fields", label: "Dynamic Fields", icon: Layers, roles: ["OPS_ADMIN", "SENIOR_MANAGER"] },
  { to: "/app/mapping", label: "Assigns", icon: Network, roles: ["OPS_ADMIN", "SENIOR_MANAGER"] },
  { to: "/app/org", label: "Org Chart", icon: GitBranch, roles: ["OPS_ADMIN", "SENIOR_MANAGER"] },
  { to: "/app/requests", label: "Requests", icon: GitPullRequest, roles: STAFF },
  { to: "/app/users", label: "Users", icon: UserCog, roles: ["OPS_ADMIN"] },
  { to: "/app/audit", label: "Audit Log", icon: ScrollText, roles: ["OPS_ADMIN", "SENIOR_MANAGER"] },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let on = true;
    const tick = () => api.get("/notifications/count").then((r) => on && setUnread(r.count)).catch(() => {});
    tick();
    const t = setInterval(tick, 30000);
    return () => { on = false; clearInterval(t); };
  }, [user]);

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
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  const go = (to: string) => { setMenuOpen(false); navigate(to); };

  return (
    // Full-height shell: the sidebar stays fixed; only <main> scrolls.
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
        <Link to="/app" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"><GraduationCap className="h-5 w-5" /></span>
          <span><span className="block text-sm font-bold leading-tight">FacultyOps</span><span className="block text-[10px] uppercase tracking-wide text-slate-400">NIAT Campus Suite</span></span>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}>
              <n.icon className="h-4 w-4" /> <span className="flex-1">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Profile row → opens a popup menu to the right with Edit profile / Notifications / Logout */}
        <div ref={menuRef} className="relative mt-4 border-t border-slate-100 pt-3">
          <button onClick={() => setMenuOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
              {user.name.charAt(0)}
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500" />}
            </span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{user.name}</div><div className="text-[11px] text-slate-400">{ROLE_LABEL[user.role]}</div></div>
            <ChevronRight className={`h-4 w-4 text-slate-400 transition ${menuOpen ? "rotate-90" : ""}`} />
          </button>

          {menuOpen && (
            <div className="absolute bottom-0 left-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-[11px] text-slate-400">{user.email}</div></div>
              <button onClick={() => go("/app/settings")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><UserCircle className="h-4 w-4 text-slate-400" /> Edit profile</button>
              <button onClick={() => go("/app/notifications")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                <Bell className="h-4 w-4 text-slate-400" /> <span className="flex-1">Notifications</span>
                {unread > 0 && <span className="chip chip-status">{unread}</span>}
              </button>
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
