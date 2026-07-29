import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Settings as SettingsIcon, BookOpen } from "lucide-react";
import { useAuth } from "../../auth";
import { FormSkeleton } from "../../components/skeletons";
import Breadcrumbs from "../../components/Breadcrumbs";

const TABS = [
  { to: "/app/settings", label: "Dynamic Fields", end: true },
  { to: "/app/settings/communications", label: "Notifications & Emails" },
  { to: "/app/settings/system", label: "System" },
  { to: "/app/settings/operations", label: "Operations" },
  { to: "/app/settings/removed", label: "Removed" },
];

export default function SettingsLayout() {
  const { user } = useAuth();
  const docsHref = user ? `/docs?role=${encodeURIComponent(user.role)}` : "/docs";

  return (
    <div className="space-y-0">
      <Breadcrumbs items={[{ label: "Dashboard", to: "/app" }, { label: "Settings" }]} />
      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><SettingsIcon className="h-6 w-6 text-brand-600" strokeWidth={1.75} /> Settings</h1>
        </div>
        <a href={docsHref} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm shrink-0"><BookOpen className="h-4 w-4 text-brand-600" strokeWidth={1.75} /> Documentation</a>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition ${
                isActive ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="pt-4">
        <Suspense fallback={<FormSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
