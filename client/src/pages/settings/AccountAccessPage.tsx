import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { api } from "../../api";
import { ROLE_LABEL } from "../../auth";
import { useToast } from "../../toast";
import { Skeleton } from "../../components/Skeleton";

// Order + helper text for each role row.
const ROLE_ROWS: { key: string; desc: string }[] = [
  { key: "OPS_ADMIN", desc: "Full system administrators. Access can never be disabled." },
  { key: "SENIOR_MANAGER", desc: "Org-wide managers who approve requests and manage the schema." },
  { key: "CAPABILITY_MANAGER", desc: "Manage their own assigned instructors." },
  { key: "INSTRUCTOR", desc: "Self-service access to their own stats and profile." },
];

export default function AccountAccessPage() {
  const toast = useToast();
  const [access, setAccess] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { api.get("/settings/role-access").then((r) => setAccess(r.roleAccess)).catch((e) => toast.error(e.message)); }, []);

  async function toggle(role: string, enabled: boolean) {
    if (role === "OPS_ADMIN") return; // locked
    const prev = access![role];
    setAccess((a) => ({ ...(a as any), [role]: enabled }));
    setBusy(role);
    try {
      const r = await api.patch("/settings/role-access", { role, enabled });
      setAccess(r.roleAccess);
      toast.success(`${ROLE_LABEL[role]} access ${enabled ? "enabled" : "disabled"}.`);
    } catch (e: any) {
      setAccess((a) => ({ ...(a as any), [role]: prev }));
      toast.error(e.message || "Failed to update");
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Account Access</h2></div>
        <p className="mb-5 text-sm text-slate-500">
          Turn portal access on or off for an entire role. When a role is <b>off</b>, those users cannot log in, and anyone already
          signed in is blocked with a "contact your admin" message until you switch it back on.
        </p>

        <div className="divide-y divide-slate-100">
          {ROLE_ROWS.map(({ key, desc }) => {
            const on = access ? access[key] !== false : false;
            const locked = key === "OPS_ADMIN";
            return (
              <div key={key} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{ROLE_LABEL[key] || key}</span>
                    {locked && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"><Lock className="h-3 w-3" /> Always on</span>}
                    {access ? <span className={`chip ${on ? "chip-public" : "chip-sensitive"}`}>{on ? "Active" : "Inactive"}</span> : <Skeleton width="52px" height="20px" borderRadius="9999px" />}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                </div>
                {access ? (
                  <button
                    role="switch"
                    aria-checked={on}
                    disabled={locked || busy === key}
                    onClick={() => toggle(key, !on)}
                    title={locked ? "Ops Admin access can't be disabled" : on ? "Disable access" : "Enable access"}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-brand-600" : "bg-slate-300"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                ) : <Skeleton width="44px" height="24px" borderRadius="9999px" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
