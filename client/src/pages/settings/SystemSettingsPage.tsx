import GeneralSettingsPage from "./GeneralSettingsPage";
import SecuritySettingsPage from "./SecuritySettingsPage";
import AccountAccessPage from "./AccountAccessPage";
import DataSettingsPage from "./DataSettingsPage";

// "System" tab — General, Security, Account Access and Data & Retention stacked (unchanged behavior).
export default function SystemSettingsPage() {
  return (
    <div className="space-y-8">
      <GeneralSettingsPage />
      <SecuritySettingsPage />
      <AccountAccessPage />
      <DataSettingsPage />
    </div>
  );
}
