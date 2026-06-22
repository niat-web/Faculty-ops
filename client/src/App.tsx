import { Component, Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Lock, AlertTriangle } from "lucide-react";
import { useAuth } from "./auth";
import AppShell from "./components/AppShell";
import Loading from "./components/Loading";
import TopProgressBar from "./components/TopProgressBar";
import { progress } from "./progress";

// Suspense fallback for lazy route chunks — drives the top bar (chunk loads aren't API calls) and
// renders no in-page spinner.
function RouteFallback() {
  useEffect(() => { progress.start(); return () => { progress.done(); }; }, []);
  return <Loading />;
}
// Login/Reset stay eager (entry points); everything else is code-split so each page
// loads its own chunk on demand → much smaller initial bundle + faster first paint.
import LoginPage from "./pages/LoginPage";
import ResetPage from "./pages/ResetPage";
const PrintProfilePage = lazy(() => import("./pages/PrintProfilePage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InstructorsPage = lazy(() => import("./pages/InstructorsPage"));
const InstructorMasterPage = lazy(() => import("./pages/InstructorMasterPage"));
const InstructorExitedPage = lazy(() => import("./pages/InstructorExitedPage"));
const RolesPage = lazy(() => import("./pages/RolesPage"));
const InstructorProfilePage = lazy(() => import("./pages/InstructorProfilePage"));
const MyStatsPage = lazy(() => import("./pages/MyStatsPage"));
const TrainingPage = lazy(() => import("./pages/TrainingPage"));
const TrainingColumnsPage = lazy(() => import("./pages/TrainingColumnsPage"));
const MasterColumnsPage = lazy(() => import("./pages/MasterColumnsPage"));
const ContributionPage = lazy(() => import("./pages/ContributionPage"));
const CampuswisePage = lazy(() => import("./pages/CampuswisePage"));
const ManagerDistributionPage = lazy(() => import("./pages/ManagerDistributionPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const FieldsPage = lazy(() => import("./pages/FieldsPage"));
const MappingPage = lazy(() => import("./pages/MappingPage"));
const OrgPage = lazy(() => import("./pages/OrgPage"));
const RequestsPage = lazy(() => import("./pages/RequestsPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SettingsLayout = lazy(() => import("./pages/settings/SettingsLayout"));
const NotificationsSettingsPage = lazy(() => import("./pages/settings/NotificationsSettingsPage"));
const EmailsSettingsPage = lazy(() => import("./pages/settings/EmailsSettingsPage"));
const GeneralSettingsPage = lazy(() => import("./pages/settings/GeneralSettingsPage"));
const SecuritySettingsPage = lazy(() => import("./pages/settings/SecuritySettingsPage"));
const DataSettingsPage = lazy(() => import("./pages/settings/DataSettingsPage"));
const AccountAccessPage = lazy(() => import("./pages/settings/AccountAccessPage"));

// Catches render-time errors (e.g. an unexpected API shape) so a page degrades to a card
// instead of a blank white screen. (Bug B7)
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[ui] render error:", error, info); }
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
      <Route path="/print/instructors/:id" element={<Protected><Suspense fallback={<Loading full />}><PrintProfilePage /></Suspense></Protected>} />
      <Route
        path="/app/*"
        element={
          <Protected>
            <AppShell>
              <ErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route index element={<DashboardPage />} />
                <Route path="my-stats" element={<RequireRole roles={["INSTRUCTOR"]}><MyStatsPage /></RequireRole>} />
                <Route path="instructors" element={<RequireRole roles={STAFF}><InstructorsPage /></RequireRole>} />
                <Route path="instructors/master" element={<RequireRole roles={STAFF}><InstructorMasterPage /></RequireRole>} />
                <Route path="instructors/exited" element={<RequireRole roles={STAFF}><InstructorExitedPage /></RequireRole>} />
                <Route path="instructors/roles" element={<RequireRole roles={STAFF}><RolesPage /></RequireRole>} />
                <Route path="instructors/:id" element={<InstructorProfilePage />} />
                <Route path="training" element={<Navigate to="/app/training/tech-stats" replace />} />
                <Route path="training/:slug" element={<RequireRole roles={STAFF}><TrainingPage /></RequireRole>} />
                <Route path="contribution" element={<Navigate to="/app/contribution/distribution" replace />} />
                <Route path="contribution/distribution" element={<RequireRole roles={STAFF}><ContributionPage /></RequireRole>} />
                <Route path="contribution/campuswise" element={<RequireRole roles={STAFF}><CampuswisePage /></RequireRole>} />
                <Route path="contribution/managers" element={<RequireRole roles={STAFF}><ManagerDistributionPage /></RequireRole>} />
                <Route path="users" element={<RequireRole roles={["OPS_ADMIN"]}><UsersPage /></RequireRole>} />
                <Route path="fields" element={<Navigate to="/app/settings" replace />} />
                <Route path="mapping" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><MappingPage /></RequireRole>} />
                <Route path="org" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><OrgPage /></RequireRole>} />
                <Route path="requests" element={<RequireRole roles={STAFF}><RequestsPage /></RequireRole>} />
                <Route path="requests/:id" element={<RequireRole roles={STAFF}><RequestsPage /></RequireRole>} />
                <Route path="audit" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><AuditPage /></RequireRole>} />
                <Route path="notifications" element={<NotificationsPage />} />
                {/* Personal account settings (all users) — moved from /app/settings */}
                <Route path="account" element={<SettingsPage />} />
                {/* Admin Settings (Ops only) — tabbed, each tab an in-app sub-route */}
                <Route path="settings" element={<RequireRole roles={["OPS_ADMIN"]}><SettingsLayout /></RequireRole>}>
                  <Route index element={<FieldsPage />} />
                  <Route path="notifications" element={<NotificationsSettingsPage />} />
                  <Route path="emails" element={<EmailsSettingsPage />} />
                  <Route path="general" element={<GeneralSettingsPage />} />
                  <Route path="security" element={<SecuritySettingsPage />} />
                  <Route path="access" element={<AccountAccessPage />} />
                  <Route path="data" element={<DataSettingsPage />} />
                </Route>
                <Route path="settings/fields/training/:track" element={<RequireRole roles={["OPS_ADMIN"]}><TrainingColumnsPage /></RequireRole>} />
                <Route path="settings/fields/master" element={<RequireRole roles={["OPS_ADMIN"]}><MasterColumnsPage /></RequireRole>} />
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
