import { useEffect, useState } from "react";
import { Search, Plus, Mail, Pencil, Trash2, Copy } from "lucide-react";
import { api } from "../api";
import { ROLE_LABEL } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";

const ROLES = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"];

export default function UsersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null); // user object or {} for new
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ link: string; email: string; delivered: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  function load() { setReloadKey((k) => k + 1); }
  useEffect(() => {
    const ac = new AbortController();
    const p = new URLSearchParams({ page: String(page), per: String(per) });
    if (dq) p.set("q", dq); if (role) p.set("role", role);
    api.get(`/users?${p}`, { signal: ac.signal }).then((r) => { setData(r); setErr(null); }).catch((e) => { if (!isAbort(e)) setErr(e.message); });
    return () => ac.abort();
  }, [dq, role, page, per, reloadKey]);

  async function remove(u: any) {
    if (!(await confirm({ title: "Delete user?", message: `Delete ${u.name}? This cannot be undone.` }))) return;
    try { await api.del(`/users/${u.id}`); toast.success("User deleted."); load(); } catch (e: any) { toast.error(e.message); }
  }
  async function sendInvite(u: any) {
    try { const r = await api.post(`/users/${u.id}/invite`); setInvite({ link: r.link, email: r.email, delivered: r.delivered }); } catch (e: any) { toast.error(e.message); }
  }
  async function bulkInvite(scope: "pending" | "all") {
    if (!(await confirm({ title: "Send invites?", message: `Send set-password invites to ${scope === "all" ? "all active users" : "users who haven't set a password"}?`, confirmText: "Send", danger: false }))) return;
    setBusy(true);
    try { const r = await api.post(`/users/invite/bulk`, { scope }); setMsg(`Invited ${r.count} user(s), ${r.delivered} email(s) delivered.`); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Users</h1>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => bulkInvite("pending")} className="btn btn-ghost btn-sm"><Mail className="h-4 w-4" /> Invite pending</button>
          <button onClick={() => setEditing({})} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Add user</button>
        </div>
      </div>

      {msg && <div className="card border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-700">{msg}</div>}
      {err && <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={load} className="btn btn-ghost btn-sm">Retry</button></div>}

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Name or email…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <div><label className="label">Role</label>
          <select className="input w-52" value={role} onChange={(e) => { setPage(1); setRole(e.target.value); }}>
            <option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{data?.total ?? "…"} user(s)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Reports to</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.users.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{u.name}</td>
                  <td className="px-5 py-3 text-slate-500">{u.email}</td>
                  <td className="px-5 py-3"><span className="chip chip-gray">{ROLE_LABEL[u.role]}</span></td>
                  <td className="px-5 py-3 text-slate-500">{u.managerName || "—"}</td>
                  <td className="px-5 py-3">{u.active ? (u.mustSetPassword ? <span className="chip chip-necessary">Pending password</span> : <span className="chip chip-public">Active</span>) : <span className="chip chip-sensitive">Inactive</span>}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button title="Send invite" onClick={() => sendInvite(u)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Mail className="h-4 w-4" /></button>
                      <button title="Edit" onClick={() => setEditing(u)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                      <button title="Delete" onClick={() => remove(u)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data && <Pagination page={data.page} pages={pages} per={per} total={data.total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />}

      {editing && <UserModal user={editing} seniors={data?.seniors || []} onClose={() => setEditing(null)} onSaved={(inv: any) => { setEditing(null); load(); if (inv?.inviteLink) setInvite({ link: inv.inviteLink, email: inv.email, delivered: inv.emailed }); }} />}
      {invite && (
        <Modal title="Set-password invite" onClose={() => setInvite(null)}>
          <p className="text-sm text-slate-600">{invite.delivered ? `An email was sent to ${invite.email}.` : `Could not email automatically — share this link with the user:`}</p>
          <div className="mt-3 flex gap-2">
            <input readOnly className="input font-mono text-xs" value={invite.link} onFocus={(e) => e.target.select()} />
            <button onClick={() => navigator.clipboard.writeText(invite.link)} className="btn btn-ghost btn-sm shrink-0"><Copy className="h-4 w-4" /></button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function UserModal({ user, seniors, onClose, onSaved }: { user: any; seniors: any[]; onClose: () => void; onSaved: (inv: any) => void }) {
  const isNew = !user.id;
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [role, setRole] = useState(user.role || "INSTRUCTOR");
  const [managerId, setManagerId] = useState(user.managerId || "");
  const [active, setActive] = useState(user.active ?? true);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setErr(null);
    try {
      if (isNew) {
        const r = await api.post(`/users`, { name, email, role, managerId: managerId || null, password: password || undefined });
        onSaved(r);
      } else {
        await api.patch(`/users/${user.id}`, { name, email, role, managerId: managerId || null, active, newPassword: password || undefined });
        onSaved(null);
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? "Add user" : "Edit user"} onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => { setRole(e.target.value); if (e.target.value !== "CAPABILITY_MANAGER") setManagerId(""); }}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </div>
        {role === "CAPABILITY_MANAGER" && (
          <div><label className="label">Reports to (Senior Manager)</label>
            <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">— select —</option>{seniors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {!isNew && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>}
        <div><label className="label">{isNew ? "Password (optional — emails a set-password link if blank)" : "New password (leave blank to keep)"}</label><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
