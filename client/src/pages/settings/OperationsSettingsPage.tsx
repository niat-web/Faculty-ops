import SeniorManagersSettingsPage from "./SeniorManagersSettingsPage";
import ExitAlertsSettingsPage from "./ExitAlertsSettingsPage";
import CertificationsSettingsPage from "./CertificationsSettingsPage";

// "Operations" tab — Senior Managers, Exit Alerts and Certifications stacked (unchanged behavior).
export default function OperationsSettingsPage() {
  return (
    <div className="space-y-8">
      <SeniorManagersSettingsPage />
      <ExitAlertsSettingsPage />
      <CertificationsSettingsPage />
    </div>
  );
}
