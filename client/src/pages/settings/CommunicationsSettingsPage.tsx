import NotificationsSettingsPage from "./NotificationsSettingsPage";
import EmailsSettingsPage from "./EmailsSettingsPage";

// "Notifications & Emails" tab — the two existing pages side by side (unchanged behavior).
export default function CommunicationsSettingsPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <NotificationsSettingsPage />
      <EmailsSettingsPage />
    </div>
  );
}
