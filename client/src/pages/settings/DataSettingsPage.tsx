import { Database } from "lucide-react";

export default function DataSettingsPage() {
  return (
    <div className="card p-6">
      <div className="mb-2 flex items-center gap-2"><Database className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Data &amp; Retention</h2></div>
      <p className="text-sm text-slate-500">Audit &amp; notification retention period, manual prune, and data exports. (Configuration coming in the next step.)</p>
    </div>
  );
}
