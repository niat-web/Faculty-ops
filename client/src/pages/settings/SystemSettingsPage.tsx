import GeneralSettingsPage from "./GeneralSettingsPage";
import SecuritySettingsPage from "./SecuritySettingsPage";
import AccountAccessPage from "./AccountAccessPage";
import DataSettingsPage from "./DataSettingsPage";
import RolePermissionsSettingsPage from "./RolePermissionsSettingsPage";
import { useAuth } from "../../auth";

// "System" tab — General, Security, Account Access and Data & Retention stacked (unchanged behavior).
export default function SystemSettingsPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-8">
      {user?.role === "SUPER_ADMIN" && <RolePermissionsSettingsPage />}
      <GeneralSettingsPage />
      <SecuritySettingsPage />
      <AccountAccessPage />
      <DataSettingsPage />
    </div>
  );
}
