import { Bell } from "lucide-react";

export default function NotificationsSettingsPage() {
  return (
    <div className="card p-6">
      <div className="mb-2 flex items-center gap-2"><Bell className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">In-app Notifications</h2></div>
      <p className="text-sm text-slate-500">Control which events create in-app notifications, per recipient role. (Configuration coming in the next step.)</p>
    </div>
  );
}
