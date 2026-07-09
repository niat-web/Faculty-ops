import SeniorManagersSettingsPage from "./SeniorManagersSettingsPage";
import MasterDepartmentsSettingsPage from "./MasterDepartmentsSettingsPage";
import MasterPayrollSettingsPage from "./MasterPayrollSettingsPage";
import ExitAlertsSettingsPage from "./ExitAlertsSettingsPage";
import CertificationsSettingsPage from "./CertificationsSettingsPage";

// "Operations" tab — Senior Managers, Master departments, Master payroll, Exit Alerts and Certifications.
export default function OperationsSettingsPage() {
  return (
    <div className="space-y-8">
      <SeniorManagersSettingsPage />
      <MasterDepartmentsSettingsPage />
      <MasterPayrollSettingsPage />
      <ExitAlertsSettingsPage />
      <CertificationsSettingsPage />
    </div>
  );
}
