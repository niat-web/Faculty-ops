"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Copy, Check } from "lucide-react";
import { ROLE_LABEL } from "@/lib/enums.js";
import { useUI } from "./UIProvider.js";

const ROLES = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"];

// "Add user" header button → opens a modal with the create form. No password is
// typed: the new user receives a 1-hour "set your password" link by email.
export default function AddUserButton({ seniors }) {
  const router = useRouter();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("CAPABILITY_MANAGER");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null); // { link, emailed }
  const [copied, setCopied] = useState(false);

  async function create(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const fd = new FormData(e.target);
    const res = await fetch("/api/users", { method: "POST", body: fd });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      router.refresh();
      if (j.inviteLink) { setResult({ link: j.inviteLink, emailed: j.emailed }); ui.toast(j.emailed ? "User created • set-password mail sent" : "User created • share the link"); }
      else { setOpen(false); setRole("CAPABILITY_MANAGER"); ui.toast("User created"); }
    } else setErr(j.error || "Failed");
  }

  function close() { setOpen(false); setRole("CAPABILITY_MANAGER"); setResult(null); setErr(null); }
  async function copy() { try { await navigator.clipboard.writeText(result.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }

  return (
    <>
      <button onClick={() => { setErr(null); setResult(null); setOpen(true); }} className="btn btn-primary btn-sm">
        <UserPlus className="h-4 w-4" /> Add user
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add a user</h3>
              <button onClick={close} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>

            {result ? (
              <div>
                <p className="text-sm text-slate-600">
                  {result.emailed
                    ? <>Done — a set-password mail was sent. The link is valid for <b>1 hour</b>.</>
                    : <>Done. Email isn't configured yet, so share this <b>1-hour</b> set-password link with the new user:</>}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <input readOnly value={result.link} className="input flex-1 text-xs" onFocus={(e) => e.target.select()} />
                  <button onClick={copy} className="btn btn-primary btn-sm whitespace-nowrap">{copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</button>
                </div>
                <div className="mt-4 flex justify-end"><button className="btn btn-ghost btn-sm" onClick={close}>Done</button></div>
              </div>
            ) : (
              <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
                <div><label className="label">Name</label><input name="name" className="input" required autoFocus /></div>
                <div><label className="label">Email (sign-in ID)</label><input name="email" type="email" className="input" required /></div>
                <div>
                  <label className="label">Role</label>
                  <select name="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>
                {role === "CAPABILITY_MANAGER" && (
                  <div>
                    <label className="label">Reports to (Senior Manager)</label>
                    <select name="managerId" className="input" required>
                      <option value="">Choose…</option>
                      {seniors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                <p className="text-xs text-slate-400 sm:col-span-2">No password needed — the user gets a secure link by email to set their own (valid 1 hour).</p>
                {err && <p className="text-sm text-rose-600 sm:col-span-2">{err}</p>}
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={close}>Cancel</button>
                  <button className="btn btn-primary btn-sm" disabled={busy}><UserPlus className="h-4 w-4" /> {busy ? "Creating…" : "Create & email link"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
