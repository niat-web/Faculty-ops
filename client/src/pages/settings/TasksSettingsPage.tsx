import { useEffect, useState } from "react";
import { CheckSquare } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { Skeleton } from "../../components/Skeleton";

export default function TasksSettingsPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get("/settings/tasks").then((r) => setTasks(r.tasks)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  async function toggle(key: string, enabled: boolean) {
    setBusy(key);
    setTasks((s: any) => ({ ...s, [key]: enabled }));
    try {
      const r = await api.patch("/settings/tasks", { [key]: enabled });
      setTasks(r.tasks);
    } catch (e: any) {
      toast.error(e.message);
      setTasks((s: any) => ({ ...s, [key]: !enabled }));
    } finally { setBusy(null); }
  }

  const items = [
    {
      key: "cmCanAssignToInstructors",
      label: "Capability Managers can assign tasks",
      desc: "When on, Capability Managers can assign tasks to instructors in their scope. Ops Admins can always assign tasks.",
    },
    {
      key: "seniorManagerCanAssign",
      label: "Senior Managers can assign tasks",
      desc: "When on, Senior Managers can assign tasks to instructors (same scope rules as edit requests).",
    },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2"><CheckSquare className="h-5 w-5 text-brand-600" /><h2 className="font-semibold text-slate-800">Tasks</h2></div>
        <p className="mt-1 text-sm text-slate-500">Control who can assign tasks besides Ops Admins. Assignees always see tasks in the Tasks menu.</p>
      </div>
      {loading ? (
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="space-y-1.5"><Skeleton width="220px" height="14px" /><Skeleton width="320px" height="10px" /></div>
              <Skeleton width="44px" height="24px" borderRadius="9999px" />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((e) => {
            const on = tasks?.[e.key] === true;
            return (
              <div key={e.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{e.label}</div>
                  <div className="text-xs text-slate-500">{e.desc}</div>
                </div>
                <button
                  role="switch"
                  aria-checked={on}
                  disabled={busy === e.key}
                  onClick={() => toggle(e.key, !on)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300"}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
