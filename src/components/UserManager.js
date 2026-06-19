"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X, Mail, Send, Copy, Check } from "lucide-react";
import { ROLE_LABEL } from "@/lib/enums.js";
import { useUI } from "./UIProvider.js";

const ROLES = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"];

export default function UserManager({ users, seniors, meId }) {
  const router = useRouter();
  const ui = useUI();
  const [editing, setEditing] = useState(null);
  const [linkInfo, setLinkInfo] = useState(null); // { email, link, delivered }
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const pendingCount = users.filter((u) => u.mustSetPassword).length;

  async function remove(u) {
    const ok = await ui.confirm({ title: `Delete ${u.name}?`, message: "This permanently removes their login. Reportees/CMs must be reassigned first.", confirmText: "Delete", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { router.refresh(); ui.toast("User deleted"); }
    else ui.toast(j.error || "Failed to delete", "error");
  }

  async function invite(u) {
    setBusyId(u.id);
    const res = await fetch(`/api/users/${u.id}/invite`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusyId(null);
    if (res.ok) {
      setLinkInfo({ email: j.email, link: j.link, delivered: j.delivered });
      ui.toast(j.delivered ? "Set-password mail sent" : "Link created (email not configured)");
      router.refresh();
    } else ui.toast(j.error || "Failed to create link", "error");
  }

  async function inviteAllPending() {
    const ok = await ui.confirm({ title: "Send set-password mails?", message: `This emails a 1-hour set-password link to all ${pendingCount} pending user(s).`, confirmText: "Send mails" });
    if (!ok) return;
    setBulkBusy(true);
    const res = await fetch(`/api/users/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "pending" }) });
    const j = await res.json().catch(() => ({}));
    setBulkBusy(false);
    if (res.ok) { router.refresh(); ui.toast(`${j.count} link(s) created • ${j.delivered} email(s) delivered`); }
    else ui.toast(j.error || "Failed", "error");
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-500">
            {users.length} user(s){pendingCount > 0 && <span className="ml-2 text-amber-600">• {pendingCount} awaiting password setup</span>}
          </span>
          {pendingCount > 0 && (
            <button onClick={inviteAllPending} disabled={bulkBusy} className="btn btn-ghost btn-sm">
              <Send className="h-4 w-4" /> {bulkBusy ? "Sending…" : `Send set-password mail to all pending (${pendingCount})`}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Reports to</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{u.name}{u.id === meId && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}</td>
                  <td className="px-5 py-3 text-slate-500">{u.email}</td>
                  <td className="px-5 py-3"><span className="chip chip-status">{ROLE_LABEL[u.role]}</span></td>
                  <td className="px-5 py-3 text-slate-500">{u.managerName || "—"}</td>
                  <td className="px-5 py-3">
                    {!u.active ? <span className="chip chip-gray">inactive</span>
                      : u.mustSetPassword ? <span className="chip bg-amber-50 text-amber-700">password pending</span>
                      : <span className="chip chip-public">active</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => invite(u)} disabled={busyId === u.id} title="Send set-password mail" className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30"><Mail className="h-4 w-4" /></button>
                      <button onClick={() => setEditing(u)} title="Edit" className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => remove(u)} disabled={u.id === meId} title={u.id === meId ? "You can't delete yourself" : "Delete"} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {linkInfo && <LinkModal info={linkInfo} onClose={() => setLinkInfo(null)} />}

      {editing && (
        <EditUserModal
          user={editing}
          seniors={seniors}
          isSelf={editing.id === meId}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); router.refresh(); ui.toast("User updated"); }}
          onError={(m) => ui.toast(m, "error")}
        />
      )}
    </>
  );
}

function LinkModal({ info, onClose }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(info.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Set-password link</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-slate-600">
          {info.delivered
            ? <>A set-password mail was sent to <b>{info.email}</b>. Valid for 1 hour.</>
            : <>Email isn't configured yet, so share this link with <b>{info.email}</b> directly. It's valid for <b>1 hour</b>.</>}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input readOnly value={info.link} className="input flex-1 text-xs" onFocus={(e) => e.target.select()} />
          <button onClick={copy} className="btn btn-primary btn-sm whitespace-nowrap">
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, seniors, isSelf, onClose, onDone, onError }) {
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get("name"),
      email: fd.get("email"),
      role: fd.get("role"),
      managerId: fd.get("managerId") || "",
      active: fd.get("active") === "on",
      newPassword: fd.get("newPassword") || undefined,
    };
    setBusy(true);
    const res = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) onDone();
    else { const j = await res.json().catch(() => ({})); onError(j.error || "Failed to update"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Edit user</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={save} className="space-y-3">
          <div><label className="label">Name</label><input name="name" className="input" defaultValue={user.name} required /></div>
          <div><label className="label">Email (sign-in ID)</label><input name="email" type="email" className="input" defaultValue={user.email} required /></div>
          <div>
            <label className="label">Role</label>
            <select name="role" className="input" value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            {isSelf && <p className="mt-1 text-xs text-slate-400">You can't change your own role.</p>}
          </div>
          {role === "CAPABILITY_MANAGER" && (
            <div>
              <label className="label">Reports to (Senior Manager)</label>
              <select name="managerId" className="input" defaultValue={user.managerId || ""} required>
                <option value="">Choose…</option>
                {seniors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div><label className="label">Reset password (optional)</label><input name="newPassword" type="password" className="input" placeholder="Leave blank — or use the ✉ button to email a set-password link" minLength={8} /></div>
          {!isSelf && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="active" type="checkbox" defaultChecked={user.active} className="h-4 w-4" /> Active (can sign in)
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
