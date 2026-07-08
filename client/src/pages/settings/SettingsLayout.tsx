import { NavLink, Outlet } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";

// Admin Settings shell — Ops-only. Each tab is its own in-app sub-route rendered
// in the <Outlet/> below (NOT a new browser tab, NOT an inline accordion).
const TABS = [
  { to: "/app/settings", label: "Dynamic Fields", end: true },
  { to: "/app/settings/communications", label: "Notifications & Emails" },
  { to: "/app/settings/system", label: "System" },
  { to: "/app/settings/operations", label: "Operations" },
];

export default function SettingsLayout() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><SettingsIcon className="h-6 w-6 text-brand-600" /> Settings</h1>
        <p className="text-sm text-slate-500">Manage the schema, notifications, emails and system configuration for FacultyOps.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
                isActive ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
