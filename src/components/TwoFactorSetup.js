"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useUI } from "./UIProvider.js";

export default function TwoFactorSetup({ enabled }) {
  const ui = useUI();
  const [on, setOn] = useState(enabled);
  const [setup, setSetup] = useState(null); // { secret, otpauth }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    const res = await fetch("/api/2fa/setup", { method: "POST" });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) setSetup(j); else ui.toast(j.error || "Failed", "error");
  }

  async function confirmEnable() {
    setBusy(true);
    const res = await fetch("/api/2fa/enable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setOn(true); setSetup(null); setCode(""); ui.toast("Two-factor authentication enabled"); }
    else ui.toast(j.error || "Failed", "error");
  }

  async function disable() {
    const password = await ui.prompt({ title: "Disable 2FA", message: "Enter your password to confirm.", placeholder: "Password", confirmText: "Disable", danger: true });
    if (!password) return;
    const res = await fetch("/api/2fa/disable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setOn(false); ui.toast("Two-factor authentication disabled"); }
    else ui.toast(j.error || "Failed", "error");
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${on ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
            {on ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-800">Two-factor authentication (2FA)</div>
            <div className="text-xs text-slate-400">{on ? "Enabled — a code is required at sign-in." : "Add a second step at sign-in using an authenticator app."}</div>
          </div>
        </div>
        {on ? (
          <button className="btn btn-ghost btn-sm" onClick={disable}>Disable</button>
        ) : !setup ? (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={startSetup}>{busy ? "…" : "Enable"}</button>
        ) : null}
      </div>

      {setup && !on && (
        <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-600">1. In your authenticator app (Google Authenticator, Authy…), add an account using this key:</p>
          <code className="block break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono">{setup.secret}</code>
          <p className="break-all text-xs text-slate-400">Or use this setup URI: {setup.otpauth}</p>
          <p className="text-sm text-slate-600">2. Enter the current 6-digit code to confirm:</p>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="000000"
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-center tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            <button className="btn btn-primary btn-sm" disabled={busy || code.length !== 6} onClick={confirmEnable}>Confirm &amp; enable</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSetup(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
