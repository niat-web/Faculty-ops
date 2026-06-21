import { useEffect, useState } from "react";
import { Building2, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import Loading from "../../components/Loading";

type General = { appName: string; organisation: string; appUrl: string; supportEmail: string };
type Integrations = { email: boolean; google: boolean; encryption: boolean; cron: boolean };

const INTEGRATION_ROWS: { key: keyof Integrations; label: string; desc: string }[] = [
  { key: "email", label: "Email (AWS SES)", desc: "Outgoing notification & invite emails." },
  { key: "google", label: "Google sign-in", desc: "OAuth login for pre-provisioned accounts." },
  { key: "encryption", label: "At-rest encryption", desc: "AES-256 encryption of sensitive field values." },
  { key: "cron", label: "Scheduled jobs", desc: "Reminders, digest and retention prune (secret-gated)." },
];

export default function GeneralSettingsPage() {
  const toast = useToast();
  const [g, setG] = useState<General | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/settings/general").then((r) => { setG(r.general); setIntegrations(r.integrations); }).catch((e) => toast.error(e.message));
  }, []);

  async function save() {
    if (!g) return;
    setBusy(true);
    try { const r = await api.patch("/settings/general", g); setG(r.general); toast.success("General settings saved."); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (!g) return <Loading />;
  const set = (k: keyof General) => (e: React.ChangeEvent<HTMLInputElement>) => setG({ ...g, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><Building2 className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">General</h2></div>
        <p className="mb-5 text-sm text-slate-500">Branding and contact details used across the portal and in outgoing emails.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">App name</label>
            <input className="input" value={g.appName} onChange={set("appName")} placeholder="FacultyOps" />
            <p className="mt-1 text-xs text-slate-400">Shown in the title bar and email sign-off.</p>
          </div>
          <div>
            <label className="label">Organisation</label>
            <input className="input" value={g.organisation} onChange={set("organisation")} placeholder="NIAT Campus Suite" />
          </div>
          <div>
            <label className="label">Public app URL</label>
            <input className="input" value={g.appUrl} onChange={set("appUrl")} placeholder="https://crm.example.com" />
            <p className="mt-1 text-xs text-slate-400">Base URL used for links in notification emails.</p>
          </div>
          <div>
            <label className="label">Support email</label>
            <input className="input" type="email" value={g.supportEmail} onChange={set("supportEmail")} placeholder="support@example.com" />
            <p className="mt-1 text-xs text-slate-400">Where users are told to reach out for help.</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-1 font-semibold text-slate-800">Integration status</h3>
        <p className="mb-4 text-sm text-slate-500">Configured on the server via environment variables (read-only here).</p>
        <div className="divide-y divide-slate-100">
          {integrations && INTEGRATION_ROWS.map(({ key, label, desc }) => {
            const on = integrations[key];
            return (
              <div key={key} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{label}</div>
                  <div className="text-xs text-slate-500">{desc}</div>
                </div>
                {on
                  ? <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Connected</span>
                  : <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-400"><XCircle className="h-4 w-4" /> Not configured</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
