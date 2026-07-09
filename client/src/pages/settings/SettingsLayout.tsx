import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Settings as SettingsIcon, BookOpen } from "lucide-react";
import { FormSkeleton } from "../../components/skeletons";

// Admin Settings shell — Ops-only. Each tab is its own in-app sub-route rendered
// in the <Outlet/> below (NOT a new browser tab, NOT an inline accordion).
const TABS = [
  { to: "/app/settings", label: "Dynamic Fields", end: true },
  { to: "/app/settings/communications", label: "Notifications & Emails" },
  { to: "/app/settings/system", label: "System" },
  { to: "/app/settings/operations", label: "Operations" },
  { to: "/app/settings/removed", label: "Removed" },
];

export default function SettingsLayout() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><SettingsIcon className="h-6 w-6 text-brand-600" /> Settings</h1>
          <p className="text-sm text-slate-500">Manage the schema, notifications, emails and system configuration for FacultyOps.</p>
        </div>
        {/* Opens the public documentation in a NEW browser tab (standalone page, no sidebar/login). */}
        <a href="/docs" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm shrink-0 border border-slate-200"><BookOpen className="h-4 w-4 text-brand-600" /> Documentation</a>
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

      {/* The tab content has its OWN Suspense boundary, so lazy-loading a tab's chunk only shows a
          fallback in this content area — the header + tab strip stay put (no full-page reload/flash). */}
      <Suspense fallback={<FormSkeleton />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
