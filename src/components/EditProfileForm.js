"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

export default function EditProfileForm({ name, email }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    const fd = new FormData(e.target);
    const res = await fetch("/api/profile", { method: "POST", body: fd });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg(j.passwordChanged ? "Profile and password updated." : "Profile updated.");
      e.target.currentPassword.value = "";
      e.target.newPassword.value = "";
      router.refresh();
    } else setErr(j.error || "Update failed");
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Account</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Display name</label>
            <input name="name" className="input" defaultValue={name} required />
          </div>
          <div>
            <label className="label">Email (sign-in ID — cannot be changed here)</label>
            <input className="input bg-slate-50 text-slate-400" value={email} disabled />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-1 font-semibold">Change password</h2>
        <p className="mb-4 text-xs text-slate-400">Leave blank to keep your current password.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Current password</label>
            <input name="currentPassword" type="password" className="input" autoComplete="current-password" />
          </div>
          <div>
            <label className="label">New password</label>
            <input name="newPassword" type="password" className="input" autoComplete="new-password" minLength={6} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}><Check className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}</button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        {err && <span className="text-sm text-rose-600">{err}</span>}
      </div>
    </form>
  );
}
