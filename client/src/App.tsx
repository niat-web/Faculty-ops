import { Navigate, Route, Routes } from "react-router-dom";
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
import UsersPage from "./pages/UsersPage";
import FieldsPage from "./pages/FieldsPage";
import MappingPage from "./pages/MappingPage";
import OrgPage from "./pages/OrgPage";
import RequestsPage from "./pages/RequestsPage";
import AuditPage from "./pages/AuditPage";
import NotificationsPage from "./pages/NotificationsPage";
import SettingsPage from "./pages/SettingsPage";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading full />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
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
                <Route path="users" element={<RequireRole roles={["OPS_ADMIN"]}><UsersPage /></RequireRole>} />
                <Route path="fields" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><FieldsPage /></RequireRole>} />
                <Route path="fields/training/:track" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><TrainingColumnsPage /></RequireRole>} />
                <Route path="mapping" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><MappingPage /></RequireRole>} />
                <Route path="org" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><OrgPage /></RequireRole>} />
                <Route path="requests" element={<RequireRole roles={STAFF}><RequestsPage /></RequireRole>} />
                <Route path="audit" element={<RequireRole roles={["OPS_ADMIN", "SENIOR_MANAGER"]}><AuditPage /></RequireRole>} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="settings" element={<SettingsPage />} />
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
