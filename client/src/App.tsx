import { Navigate, Route, Routes } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuth } from "./auth";
import AppShell from "./components/AppShell";
import Loading from "./components/Loading";
import LoginPage from "./pages/LoginPage";
import ResetPage from "./pages/ResetPage";
import PrintProfilePage from "./pages/PrintProfilePage";
import DashboardPage from "./pages/DashboardPage";
import InstructorsPage from "./pages/InstructorsPage";
import InstructorProfilePage from "./pages/InstructorProfilePage";
import MyStatsPage from "./pages/MyStatsPage";
import TrainingPage from "./pages/TrainingPage";
import TrainingColumnsPage from "./pages/TrainingColumnsPage";
import ContributionPage from "./pages/ContributionPage";
import CampuswisePage from "./pages/CampuswisePage";
import ManagerDistributionPage from "./pages/ManagerDistributionPage";
import UsersPage from "./pages/UsersPage";
import FieldsPage from "./pages/FieldsPage";
import MappingPage from "./pages/MappingPage";
import OrgPage from "./pages/OrgPage";
import RequestsPage from "./pages/RequestsPage";
import AuditPage from "./pages/AuditPage";
import NotificationsPage from "./pages/NotificationsPage";
import SettingsPage from "./pages/SettingsPage";
import SettingsLayout from "./pages/settings/SettingsLayout";
import NotificationsSettingsPage from "./pages/settings/NotificationsSettingsPage";
import EmailsSettingsPage from "./pages/settings/EmailsSettingsPage";
import GeneralSettingsPage from "./pages/settings/GeneralSettingsPage";
import SecuritySettingsPage from "./pages/settings/SecuritySettingsPage";
import DataSettingsPage from "./pages/settings/DataSettingsPage";
import AccountAccessPage from "./pages/settings/AccountAccessPage";

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/print/instructors/:id" element={<Protected><PrintProfilePage /></Protected>} />
      <Route
        path="/app/*"
        element={
          <Protected>
            <AppShell>
              <Routes>
                <Route index element={<DashboardPage />} />
                <Route path="my-stats" element={<RequireRole roles={["INSTRUCTOR"]}><MyStatsPage /></RequireRole>} />
                <Route path="instructors" element={<RequireRole roles={STAFF}><InstructorsPage /></RequireRole>} />
                <Route path="instructors/:id" element={<InstructorProfilePage />} />
                <Route path="training" element={<RequireRole roles={STAFF}><TrainingPage /></RequireRole>} />
                <Route path="contribution" element={<Navigate to="/app/contribution/distribution" replace />} />
                <Route path="contribution/distribution" element={<RequireRole roles={STAFF}><ContributionPage /></RequireRole>} />
                <Route path="contribution/campuswise" element={<RequireRole roles={STAFF}><CampuswisePage /></RequireRole>} />
                <Route path="contribution/managers" element={<RequireRole roles={STAFF}><ManagerDistributionPage /></RequireRole>} />
                <Route path="users" element={<RequireRole roles={["OPS_ADMIN"]}><UsersPage /></RequireRole>} />
                <Route path="fields" element={<Navigate to="/app/settings" replace />} />
                <Route path="mapping" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><MappingPage /></RequireRole>} />
                <Route path="org" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><OrgPage /></RequireRole>} />
                <Route path="requests" element={<RequireRole roles={STAFF}><RequestsPage /></RequireRole>} />
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
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            </AppShell>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
