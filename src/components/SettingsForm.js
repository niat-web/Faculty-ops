"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

export default function SettingsForm({ emailNotifications }) {
  const [on, setOn] = useState(emailNotifications);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function toggle() {
    const next = !on;
    setOn(next); setBusy(true); setMsg(null);
    const res = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailNotifications: next }),
    });
    setBusy(false);
    if (res.ok) setMsg("Saved");
    else { setOn(!next); setMsg("Failed to save"); }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-4 font-semibold">Notifications</h2>
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600"><Mail className="h-5 w-5" /></div>
          <div>
            <div className="text-sm font-medium text-slate-800">Email notifications</div>
            <div className="text-xs text-slate-400">Receive emails for approvals, decisions and reminders. In-app alerts always stay on.</div>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={on}
          disabled={busy}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {msg && <p className="mt-3 text-xs text-slate-400">{msg}</p>}
    </div>
  );
}
