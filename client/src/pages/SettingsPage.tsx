import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useAuth, ROLE_LABEL } from "../auth";

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [name, setName] = useState(user!.name);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [emailNotif, setEmailNotif] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/settings").then((r) => { setOverview(r); setEmailNotif(r.emailNotifications); setName(r.name); }).catch(() => {}); }, []);

  async function save() {
    if (password && password !== confirm) { setMsg({ ok: false, text: "Passwords do not match." }); return; }
    if (password && !current) { setMsg({ ok: false, text: "Enter your current password to change it." }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.patch("/settings/profile", { name, newPassword: password || undefined, currentPassword: current || undefined });
      setPassword(""); setConfirm(""); setCurrent(""); await refresh();
      setMsg({ ok: true, text: "Profile updated." });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  async function toggleEmail(v: boolean) {
    setEmailNotif(v);
    try { await api.patch("/settings/profile", { emailNotifications: v }); } catch (e: any) { setEmailNotif(!v); setMsg({ ok: false, text: e.message }); }
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-slate-500">Manage your account, profile, and security.</p></div>

      {/* Account overview */}
      <div className="card max-w-lg p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">{user!.name.charAt(0)}</span>
          <div><div className="font-semibold">{user!.name}</div><div className="text-xs text-slate-400">{ROLE_LABEL[user!.role]}</div></div>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><dt className="text-xs text-slate-400">Email</dt><dd>{overview?.email || user!.email}</dd></div>
          <div><dt className="text-xs text-slate-400">Role</dt><dd>{ROLE_LABEL[user!.role]}</dd></div>
          {overview?.managerName && <div><dt className="text-xs text-slate-400">Reports to</dt><dd>{overview.managerName}</dd></div>}
        </dl>
      </div>

      {/* Email notifications */}
      <div className="card max-w-lg p-6">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="font-semibold">Email notifications</h2><p className="text-xs text-slate-400">Receive emails for approvals, decisions and reminders. In-app alerts always stay on.</p></div>
          <button role="switch" aria-checked={emailNotif} onClick={() => toggleEmail(!emailNotif)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${emailNotif ? "bg-brand-600" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${emailNotif ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      {/* Profile + password */}
      <div className="card max-w-lg p-6">
        <h2 className="mb-4 font-semibold">Profile &amp; password</h2>
        {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{msg.text}</div>}
        <div className="space-y-3">
          <div><label className="label">Display name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <p className="text-xs text-slate-400">Change password — leave blank to keep current.</p>
            <div><label className="label">Current password</label><input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
            <div><label className="label">New password</label><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {password && <div><label className="label">Confirm new password</label><input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>}
          </div>
          <div className="flex justify-end pt-1"><button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button></div>
        </div>
      </div>

      <TwoFactorSection />
    </div>
  );
}

function TwoFactorSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [token, setToken] = useState("");
  const [pwd, setPwd] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() { api.get("/auth/2fa/status").then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false)); }
  useEffect(load, []);

  async function begin() { setMsg(null); try { setSetup(await api.get("/auth/2fa/setup")); } catch (e: any) { setMsg({ ok: false, text: e.message }); } }
  async function enable() {
    setBusy(true); setMsg(null);
    try { await api.post("/auth/2fa/enable", { token }); setSetup(null); setToken(""); load(); setMsg({ ok: true, text: "Two-factor authentication enabled." }); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg(null);
    try { await api.post("/auth/2fa/disable", { password: pwd, token: disableToken }); setPwd(""); setDisableToken(""); load(); setMsg({ ok: true, text: "Two-factor authentication disabled." }); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="card max-w-lg p-6">
      <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Two-factor authentication</h2>
        {enabled !== null && <span className={`chip ${enabled ? "chip-public" : "chip-gray"}`}>{enabled ? "On" : "Off"}</span>}
      </div>
      {msg && <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{msg.text}</div>}

      {enabled ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Disable 2FA by confirming your password and a current authenticator code.</p>
          <input type="password" className="input" placeholder="Current password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <div className="flex gap-2"><input className="input tracking-widest" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={disableToken} onChange={(e) => setDisableToken(e.target.value)} /><button disabled={busy || !pwd || disableToken.length !== 6} onClick={disable} className="btn btn-danger btn-sm shrink-0 disabled:opacity-50">Disable</button></div>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Add this secret to your authenticator app (Google Authenticator, Authy…), then enter the 6-digit code to confirm.</p>
          <div className="rounded-lg bg-slate-50 p-3 text-center"><div className="font-mono text-lg tracking-widest">{setup.secret}</div></div>
          <div className="flex gap-2"><input className="input tracking-widest" inputMode="numeric" maxLength={6} placeholder="123456" value={token} onChange={(e) => setToken(e.target.value)} /><button disabled={busy || token.length !== 6} onClick={enable} className="btn btn-primary btn-sm shrink-0 disabled:opacity-50">Enable</button></div>
        </div>
      ) : (
        <div className="space-y-2"><p className="text-sm text-slate-500">Add a second layer of security to your account with a time-based authenticator app.</p><button onClick={begin} className="btn btn-primary btn-sm">Set up 2FA</button></div>
      )}
    </div>
  );
}
