import { ShieldCheck } from "lucide-react";

export default function SecuritySettingsPage() {
  return (
    <div className="card p-6">
      <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Security</h2></div>
      <p className="text-sm text-slate-500">Enforce two-factor authentication, login lockout thresholds, and password policy. (Configuration coming in the next step.)</p>
    </div>
  );
}
