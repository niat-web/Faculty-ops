"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewInstructorForm({ cms }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const fd = new FormData(e.target);
    const res = await fetch("/api/instructors", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) { const j = await res.json(); router.push(`/app/instructors/${j.id}`); }
    else { const j = await res.json().catch(() => ({})); setErr(j.error || "Failed"); }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div><label className="label">Employee ID</label><input name="employeeId" className="input" required /></div>
      <div><label className="label">Full name</label><input name="name" className="input" required /></div>
      <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
      <div><label className="label">Campus</label><input name="campus" className="input" /></div>
      <div>
        <label className="label">Capability Manager</label>
        <select name="managerId" className="input">
          <option value="">— unassigned —</option>
          {cms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.back()}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Creating…" : "Create instructor"}</button>
      </div>
    </form>
  );
}
