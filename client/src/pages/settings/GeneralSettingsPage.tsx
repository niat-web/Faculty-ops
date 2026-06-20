import { Building2 } from "lucide-react";

export default function GeneralSettingsPage() {
  return (
    <div className="card p-6">
      <div className="mb-2 flex items-center gap-2"><Building2 className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">General</h2></div>
      <p className="text-sm text-slate-500">App name &amp; branding, public URL, sender email, support contact, integration status. (Configuration coming in the next step.)</p>
    </div>
  );
}
