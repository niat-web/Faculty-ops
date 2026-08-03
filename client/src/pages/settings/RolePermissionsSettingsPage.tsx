import { useEffect, useState } from "react";
import { Shield, Lock } from "lucide-react";
import { api } from "../../api";
import { ROLE_LABEL } from "../../auth";
import { useToast } from "../../toast";
import { Skeleton } from "../../components/Skeleton";

type PermKey = string;
type Meta = { key: PermKey; label: string; desc: string };

export default function RolePermissionsSettingsPage() {
  const toast = useToast();
  const [permissions, setPermissions] = useState<Record<string, Record<PermKey, boolean>> | null>(null);
  const [meta, setMeta] = useState<Meta[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get("/settings/role-permissions")
      .then((r) => { setPermissions(r.permissions || {}); setMeta(r.meta || []); setRoles(r.roles || []); })
      .catch((e) => toast.error(e.message));
  }, []);

  async function toggle(role: string, permission: PermKey, enabled: boolean) {
    const prev = permissions?.[role]?.[permission];
    setPermissions((p) => ({ ...(p || {}), [role]: { ...(p?.[role] || {}), [permission]: enabled } }));
    setBusy(`${role}.${permission}`);
    try {
      const r = await api.patch("/settings/role-permissions", { role, permission, enabled });
      setPermissions(r.permissions);
      toast.success(`${ROLE_LABEL[role] || role}: ${meta.find((m) => m.key === permission)?.label || permission} ${enabled ? "enabled" : "disabled"}.`);
    } catch (e: any) {
      setPermissions((p) => {
        if (!p) return p;
        return { ...p, [role]: { ...(p[role] || {}), [permission]: prev ?? true } };
      });
      toast.error(e.message);
    } finally { setBusy(null); }
  }

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2">
        <Shield className="h-5 w-5 text-brand-600" />
        <h2 className="font-semibold">Role permissions</h2>
        <span className="chip chip-gray text-[11px]">Super Admin only</span>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        Control what each staff role can do. Defaults match the original app behaviour — nothing is restricted until you turn a permission off.
        Your Super Admin account always has full access.
      </p>

      {!permissions ? (
        <Skeleton height="200px" borderRadius="12px" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4 font-medium">Permission</th>
                {roles.map((r) => (
                  <th key={r} className="px-3 py-2 font-medium">{ROLE_LABEL[r] || r}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {meta.map((m) => (
                <tr key={m.key} className="align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-800">{m.label}</div>
                    <div className="text-xs text-slate-500">{m.desc}</div>
                  </td>
                  {roles.map((r) => {
                    const on = permissions[r]?.[m.key] !== false;
                    const id = `${r}.${m.key}`;
                    return (
                      <td key={r} className="px-3 py-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          disabled={busy === id}
                          onClick={() => toggle(r, m.key, !on)}
                          title={on ? "Disable" : "Enable"}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${on ? "bg-brand-600" : "bg-slate-300"}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        To assign the single Super Admin account, promote a staff user on the Users page (only one Super Admin is allowed).
      </p>
    </div>
  );
}
