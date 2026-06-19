"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";

// Lets an Ops Admin run the reminder scan on demand.
export default function RemindersButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function run() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/cron/reminders", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `Sent ${j.created ?? 0} reminder(s).` : (j.error || "Failed"));
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn btn-ghost btn-sm">
        <BellRing className="h-4 w-4" /> {busy ? "Running…" : "Run reminders"}
      </button>
      {msg && <span className="text-xs text-slate-400">{msg}</span>}
    </div>
  );
}
