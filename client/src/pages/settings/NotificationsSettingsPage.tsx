import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { ROLE_LABEL } from "../../auth";
import { FormSkeleton } from "../../components/skeletons";

const ROLE_ORDER = ["SENIOR_MANAGER", "CAPABILITY_MANAGER", "OPS_ADMIN", "INSTRUCTOR", "ALL"];
const groupLabel = (role: string) => (role === "ALL" ? "Everyone" : ROLE_LABEL[role] || role);

export default function NotificationsSettingsPage() {
  const toast = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get("/settings/notifications").then((r) => { setEvents(r.events); setSettings(r.settings); }).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  async function toggle(key: string, enabled: boolean) {
    setBusy(key);
    setSettings((s) => ({ ...s, [key]: enabled })); // optimistic
    try { const r = await api.patch("/settings/notifications", { key, enabled }); setSettings(r.settings); }
    catch (e: any) { toast.error(e.message); setSettings((s) => ({ ...s, [key]: !enabled })); }
    finally { setBusy(null); }
  }

  if (loading) return <FormSkeleton />;

  const groups = ROLE_ORDER
    .map((role) => ({ role, items: events.filter((e) => e.role === role) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2"><Bell className="h-5 w-5 text-brand-600" /><h2 className="font-semibold text-slate-800">In-app Notifications</h2></div>
        <p className="text-sm text-slate-500">Turn each in-app notification on or off, grouped by who receives it. Turning one off stops the bell alert for that event (emails are controlled separately under Emails). Changes apply within ~30 seconds.</p>
      </div>

      {groups.map((g) => (
        <div key={g.role} className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">To {groupLabel(g.role)}</div>
          <div className="divide-y divide-slate-100">
            {g.items.map((e) => {
              const on = settings[e.key] !== false;
              return (
                <div key={e.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{e.label}</div>
                    <div className="text-xs text-slate-500">{e.desc}</div>
                  </div>
                  <button
                    role="switch" aria-checked={on} disabled={busy === e.key} onClick={() => toggle(e.key, !on)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300"}`}
                    title={on ? "Enabled — click to turn off" : "Disabled — click to turn on"}>
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
