import { Mail } from "lucide-react";

export default function EmailsSettingsPage() {
  return (
    <div className="card p-6">
      <div className="mb-2 flex items-center gap-2"><Mail className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Email Notifications</h2></div>
      <p className="text-sm text-slate-500">Turn each email case on/off per recipient (Instructor / Capability Manager / Senior Manager / Ops) and edit templates. (Configuration coming in the next step.)</p>
    </div>
  );
}
