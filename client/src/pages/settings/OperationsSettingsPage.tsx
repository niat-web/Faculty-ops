import SeniorManagersSettingsPage from "./SeniorManagersSettingsPage";
import MasterDepartmentsSettingsPage from "./MasterDepartmentsSettingsPage";
import MasterPayrollSettingsPage from "./MasterPayrollSettingsPage";
import ExitAlertsSettingsPage from "./ExitAlertsSettingsPage";
import CertificationsSettingsPage from "./CertificationsSettingsPage";
import TasksSettingsPage from "./TasksSettingsPage";

// "Operations" tab — Senior Managers, Master departments, Master payroll, Exit Alerts, Certifications and Tasks.
export default function OperationsSettingsPage() {
  return (
    <div className="space-y-8">
      <SeniorManagersSettingsPage />
      <MasterDepartmentsSettingsPage />
      <MasterPayrollSettingsPage />
      <ExitAlertsSettingsPage />
      <CertificationsSettingsPage />
      <TasksSettingsPage />
    </div>
  );
}
