import { Component, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Lock, AlertTriangle } from "lucide-react";
import { useAuth } from "./auth";
import AppShell from "./components/AppShell";
import Loading from "./components/Loading";
import { PageSkeleton, GridSkeleton, FormSkeleton, DashboardSkeleton } from "./components/skeletons";
import TopProgressBar from "./components/TopProgressBar";
import BatchEditBar from "./components/BatchEditBar";
import { progress } from "./progress";
import { lazyWithReload as lazy, isChunkError, reloadOnce } from "./lazyWithReload";

// Per-route chunk-load skeleton: a downloading page shows ITS OWN layout (not a generic box). Each skeleton
// matches that page's data-fetch skeleton, so the chunk-load → data-fetch → content transition is seamless
// (no white flash, no generic rectangle). Also drives the top bar (chunk loads aren't API calls).
function routeSkeleton(p: string) {
  if (p === "/app" || p === "/app/") return <DashboardSkeleton />;
  if (p.startsWith("/app/training") || p.startsWith("/app/my-stats")) return <GridSkeleton cols={10} />;
  if (p.startsWith("/app/instructors/master") || p.startsWith("/app/instructors/exited") || p.startsWith("/app/instructors/moved")) return <GridSkeleton />;
  if (/^\/app\/instructors\/[^/]+$/.test(p)) return <FormSkeleton sections={3} />; // instructor profile
  if (p.startsWith("/app/settings") || p.startsWith("/app/account")) return <FormSkeleton />;
  if (p.startsWith("/app/contribution") || p.startsWith("/app/mapping") || p.startsWith("/app/requests") || p.startsWith("/app/audit")) return <GridSkeleton />;
  return <PageSkeleton />;
}
function RouteFallback() {
  useEffect(() => { progress.start(); return () => { progress.done(); }; }, []);
  const { pathname } = useLocation();
  return routeSkeleton(pathname);
}
// Login/Reset stay eager (entry points); everything else is code-split so each page
// loads its own chunk on demand → much smaller initial bundle + faster first paint.
import LoginPage from "./pages/LoginPage";
import ResetPage from "./pages/ResetPage";
const PrintProfilePage = lazy(() => import("./pages/PrintProfilePage"));
const CertificationFormPage = lazy(() => import("./pages/CertificationFormPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InstructorsPage = lazy(() => import("./pages/InstructorsPage"));
const InstructorMasterPage = lazy(() => import("./pages/InstructorMasterPage"));
const InstructorExitedPage = lazy(() => import("./pages/InstructorExitedPage"));
const InstructorMovedPage = lazy(() => import("./pages/InstructorMovedPage"));
const RolesPage = lazy(() => import("./pages/RolesPage"));
const InstructorProfilePage = lazy(() => import("./pages/InstructorProfilePage"));
const MyStatsPage = lazy(() => import("./pages/MyStatsPage"));
const TrainingPage = lazy(() => import("./pages/TrainingPage"));
const TrainingColumnsPage = lazy(() => import("./pages/TrainingColumnsPage"));
const MasterColumnsPage = lazy(() => import("./pages/MasterColumnsPage"));
const CertFormBuilderPage = lazy(() => import("./pages/settings/CertFormBuilderPage"));
const ContributionPage = lazy(() => import("./pages/ContributionPage"));
const CampuswisePage = lazy(() => import("./pages/CampuswisePage"));
const ManagerDistributionPage = lazy(() => import("./pages/ManagerDistributionPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const FieldsPage = lazy(() => import("./pages/FieldsPage"));
const OrgPage = lazy(() => import("./pages/OrgPage"));
const RequestsPage = lazy(() => import("./pages/RequestsPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const DataPage = lazy(() => import("./pages/DataPage"));
const DocsPage = lazy(() => import("./pages/DocsPage"));
const SettingsLayout = lazy(() => import("./pages/settings/SettingsLayout"));
// Settings tabs merged into 4 grouped pages (each wrapper renders the existing sub-pages unchanged).
const CommunicationsSettingsPage = lazy(() => import("./pages/settings/CommunicationsSettingsPage"));
const SystemSettingsPage = lazy(() => import("./pages/settings/SystemSettingsPage"));
const OperationsSettingsPage = lazy(() => import("./pages/settings/OperationsSettingsPage"));
const RemovedSettingsPage = lazy(() => import("./pages/settings/RemovedSettingsPage"));

// Catches render-time errors (e.g. an unexpected API shape) so a page degrades to a card
// instead of a blank white screen. (Bug B7)
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // A stale chunk after a redeploy → silently reload once to fetch the new build.
    if (isChunkError(error) && reloadOnce()) return;
    console.error("[ui] render error:", error, info);
  }
  render() {
    if (this.state.error) return (
      <div className="m-6 card p-6">
        <div className="mb-1 flex items-center gap-2 text-rose-600"><AlertTriangle className="h-5 w-5" /><h2 className="text-lg font-bold">Something went wrong</h2></div>
        <p className="text-sm text-slate-600">This page hit an unexpected error. Try reloading — if it persists, contact your admin.</p>
        <button onClick={() => location.reload()} className="btn btn-primary btn-sm mt-4">Reload</button>
      </div>
    );
    return this.props.children;
  }
}

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading, blocked, blockedMessage, logout } = useAuth();
  if (loading) return <Loading full />;
  if (blocked) return <BlockedScreen message={blockedMessage} onLogout={logout} />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Shown when an admin has disabled access for the signed-in user's role.
function BlockedScreen({ message, onLogout }: { message: string; onLogout: () => Promise<void> }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Access disabled</h1>
        <p className="mt-2 text-sm text-slate-600">{message || "Access for your role has been disabled by an administrator. Please contact your admin."}</p>
        <button onClick={onLogout} className="btn btn-primary btn-sm mt-6">Sign out</button>
      </div>
    </div>
  );
}

// Redirect the legacy /app/instructors path to the master grid, KEEPING the query string so
// deep-links like ?managerId=… (org chart, mapping) and ?campus=… (dashboard) still apply their filter.
function RedirectToMaster() {
  const { search } = useLocation();
  return <Navigate to={`/app/instructors/master${search}`} replace />;
}

// Route-level role gate — matches the sidebar's visibility so direct-URL navigation can't reach pages a role shouldn't see.
const STAFF = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER"];
function RequireRole({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <>
    <TopProgressBar />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset" element={<ResetPage />} />
      {/* Public Certificates form — opens only for the exact UUID link; access also gated server-side. */}
      <Route path="/certifications/:token" element={<Suspense fallback={<Loading full />}><CertificationFormPage /></Suspense>} />
      <Route path="/certifications" element={<Suspense fallback={<Loading full />}><CertificationFormPage /></Suspense>} />
      {/* Public documentation — standalone page, no app shell, no login required. */}
      <Route path="/docs" element={<Suspense fallback={<Loading full />}><DocsPage /></Suspense>} />
      <Route path="/print/instructors/:id" element={<Protected><Suspense fallback={<Loading full />}><PrintProfilePage /></Suspense></Protected>} />
      <Route
        path="/app/*"
        element={
          <Protected>
            <AppShell>
              <BatchEditBar />
              <ErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route index element={<DashboardPage />} />
                <Route path="my-stats" element={<RequireRole roles={["INSTRUCTOR"]}><MyStatsPage /></RequireRole>} />
                {/* Instructors list consolidated into Instructor Master — keep the old path working.
                    Preserve the query string so deep-links (?managerId / ?campus / …) still filter. */}
                <Route path="instructors" element={<RedirectToMaster />} />
                <Route path="instructors/master" element={<RequireRole roles={STAFF}><InstructorMasterPage /></RequireRole>} />
                <Route path="instructors/exited" element={<RequireRole roles={STAFF}><InstructorExitedPage /></RequireRole>} />
                <Route path="instructors/moved" element={<RequireRole roles={STAFF}><InstructorMovedPage /></RequireRole>} />
                <Route path="instructors/roles" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><RolesPage /></RequireRole>} />
                <Route path="instructors/:id" element={<InstructorProfilePage />} />
                <Route path="training" element={<Navigate to="/app/training/tech-stats" replace />} />
                <Route path="training/:slug" element={<RequireRole roles={STAFF}><TrainingPage /></RequireRole>} />
                <Route path="contribution" element={<Navigate to="/app/contribution/distribution" replace />} />
                <Route path="contribution/distribution" element={<RequireRole roles={STAFF}><ContributionPage /></RequireRole>} />
                <Route path="contribution/campuswise" element={<RequireRole roles={STAFF}><CampuswisePage /></RequireRole>} />
                <Route path="contribution/managers" element={<RequireRole roles={STAFF}><ManagerDistributionPage /></RequireRole>} />
                <Route path="users" element={<RequireRole roles={["OPS_ADMIN"]}><UsersPage /></RequireRole>} />
                <Route path="fields" element={<Navigate to="/app/settings" replace />} />
                {/* Assignments page removed — the Capability Managers list now lives in Capability Manager Distribution. */}
                <Route path="mapping" element={<Navigate to="/app/contribution/managers" replace />} />
                <Route path="org" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><OrgPage /></RequireRole>} />
                <Route path="requests" element={<RequireRole roles={STAFF}><RequestsPage /></RequireRole>} />
                <Route path="requests/:id" element={<RequireRole roles={STAFF}><RequestsPage /></RequireRole>} />
                <Route path="audit" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><AuditPage /></RequireRole>} />
                <Route path="notifications" element={<NotificationsPage />} />
                {/* Raw data browser (BigQuery / Darwinbox) — profile-menu entry, Ops only */}
                <Route path="data" element={<RequireRole roles={["OPS_ADMIN"]}><DataPage /></RequireRole>} />
                {/* Personal account settings (all users) — moved from /app/settings */}
                <Route path="account" element={<SettingsPage />} />
                {/* Admin Settings (Ops only) — tabbed, each tab an in-app sub-route */}
                <Route path="settings" element={<RequireRole roles={["OPS_ADMIN"]}><SettingsLayout /></RequireRole>}>
                  <Route index element={<FieldsPage />} />
                  <Route path="communications" element={<CommunicationsSettingsPage />} />
                  <Route path="system" element={<SystemSettingsPage />} />
                  <Route path="operations" element={<OperationsSettingsPage />} />
                  <Route path="removed" element={<RemovedSettingsPage />} />
                  {/* Old per-tab URLs → redirect to their new merged tab (keeps existing links working). */}
                  <Route path="notifications" element={<Navigate to="/app/settings/communications" replace />} />
                  <Route path="emails" element={<Navigate to="/app/settings/communications" replace />} />
                  <Route path="general" element={<Navigate to="/app/settings/system" replace />} />
                  <Route path="security" element={<Navigate to="/app/settings/system" replace />} />
                  <Route path="access" element={<Navigate to="/app/settings/system" replace />} />
                  <Route path="data" element={<Navigate to="/app/settings/system" replace />} />
                  <Route path="senior-managers" element={<Navigate to="/app/settings/operations" replace />} />
                  <Route path="exit-alerts" element={<Navigate to="/app/settings/operations" replace />} />
                  <Route path="certifications" element={<Navigate to="/app/settings/operations" replace />} />
                </Route>
                <Route path="settings/fields/training/:track" element={<RequireRole roles={["OPS_ADMIN"]}><TrainingColumnsPage /></RequireRole>} />
                <Route path="settings/fields/master" element={<RequireRole roles={["OPS_ADMIN"]}><MasterColumnsPage /></RequireRole>} />
                <Route path="settings/certifications/builder" element={<RequireRole roles={["OPS_ADMIN"]}><CertFormBuilderPage /></RequireRole>} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
              </Suspense>
              </ErrorBoundary>
            </AppShell>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
    </>
  );
}
