import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { api } from "../api";
import { LIFECYCLE_LABEL } from "../auth";
import Modal from "../components/Modal";
import Loading from "../components/Loading";

const MODULE_LABEL: Record<string, string> = {
  PERSONAL: "Personal Details", HIRING: "Hiring Details", TRAINING: "Training Stats",
  DEPLOYMENT: "Deployment", PERFORMANCE: "Performance",
};
const MODULE_ORDER = ["PERSONAL", "HIRING", "TRAINING", "DEPLOYMENT", "PERFORMANCE"];

export default function MyStatsPage() {
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState("");
  const [editField, setEditField] = useState<any>(null);

  function load() { api.get("/instructors/me").then(setP).catch((e) => setErr(e.message)); }
  useEffect(load, []);

  if (err) return <div className="card p-6 text-sm text-rose-600">{err}</div>;
  if (!p) return <Loading />;

  const inst = p.instructor;
  const moduleTabs = MODULE_ORDER.filter((m) => p.byModule[m]?.length);
  const hasSkills = p.skills?.list?.length || p.skills?.moduleStatus?.length;
  const tabs = [...moduleTabs, ...(hasSkills ? ["SKILLS"] : []), "LIFECYCLE"];
  const active = tab || tabs[0] || "LIFECYCLE";
  const label = (t: string) => MODULE_LABEL[t] || ({ SKILLS: "Skills", LIFECYCLE: "Lifecycle & Status" } as any)[t];
  const fmt = (v: any) => (v === true ? "Yes" : v === false ? "No" : v);

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">My Stats</h1><p className="text-sm text-slate-500">Review and keep your own details up to date.</p></div>

      <div className="card flex flex-wrap items-center gap-4 p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-2xl font-bold text-brand-700">{inst.name.charAt(0)}</div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{inst.name}</h2>
          <p className="text-sm text-slate-500"><span className="font-mono">{inst.employeeId}</span> · {inst.campus || "no campus"} · Manager: {inst.managerName}</p>
        </div>
        <span className="chip chip-status text-sm">{LIFECYCLE_LABEL[inst.status] || inst.status}</span>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <nav className="shrink-0 space-y-1 lg:w-56">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`nav-link w-full text-left ${active === t ? "nav-link-active" : ""}`}>{label(t)}</button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-5">
          {moduleTabs.includes(active) && (
            <div className="card p-6">
              <h2 className="mb-4 font-semibold">{label(active)}</h2>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {p.byModule[active].map((f: any) => (
                  <div key={f.key} className="group flex flex-col">
                    <dt className="text-xs text-slate-400">{f.label}</dt>
                    <dd className="flex items-center gap-2 text-sm text-slate-800">
                      <span>{fmt(f.value) || <span className="text-slate-300">—</span>}</span>
                      {f.type !== "FILE" && f.selfEditable !== false && (
                        <button onClick={() => setEditField(f)} title="Edit" className="opacity-0 transition group-hover:opacity-100"><Pencil className="h-3.5 w-3.5 text-slate-400 hover:text-brand-600" /></button>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-slate-400">Tip: hover a field and click the pencil to update it.</p>
            </div>
          )}

          {active === "SKILLS" && <MySkillsTab skills={p.skills} onChange={load} />}

          {active === "LIFECYCLE" && (
            <div className="card p-6">
              <h2 className="mb-4 font-semibold">Lifecycle & Status</h2>
              <ul className="space-y-3">
                {inst.lifecycle.length ? inst.lifecycle.map((l: any, i: number) => (
                  <li key={i} className="flex items-start gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" /><div><div className="text-sm font-medium">{LIFECYCLE_LABEL[l.status] || l.status}</div>{l.note && <div className="text-xs text-slate-500">{l.note}</div>}<div className="text-[11px] text-slate-400">{l.actorName} · {new Date(l.createdAt).toLocaleString()}</div></div></li>
                )) : <li className="text-sm text-slate-400">No lifecycle events.</li>}
              </ul>
            </div>
          )}
        </div>
      </div>

      {editField && <EditMyFieldModal field={editField} onClose={() => setEditField(null)} onDone={() => { setEditField(null); load(); }} />}
    </div>
  );
}

function EditMyFieldModal({ field, onClose, onDone }: any) {
  const [value, setValue] = useState(field.value ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setErr(null);
    try {
      await api.post(`/instructors/me/value`, { fieldKey: field.key, fieldLabel: field.label, oldValue: String(field.value ?? ""), newValue: String(value) });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Edit: ${field.label}`} onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div>
          <label className="label">New value</label>
          {field.type === "DROPDOWN" ? (
            <select className="input" value={value} onChange={(e) => setValue(e.target.value)}><option value="">— select —</option>{field.options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
          ) : field.type === "BOOLEAN" ? (
            <select className="input" value={String(value)} onChange={(e) => setValue(e.target.value === "true")}><option value="false">No</option><option value="true">Yes</option></select>
          ) : (
            <input type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"} className="input" value={value as any}
              min={field.min ?? undefined} max={field.max ?? undefined} pattern={field.pattern || undefined}
              onChange={(e) => setValue(e.target.value)} />
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

function MySkillsTab({ skills, onChange }: any) {
  const modules = skills.moduleStatus || [];
  const tone = (s: string) => { const t = (s || "").toLowerCase(); if (t.includes("complete")) return "bg-emerald-50 text-emerald-700"; if (t.includes("progress")) return "bg-amber-50 text-amber-700"; if (t.includes("hold")) return "bg-slate-100 text-slate-600"; if (t.includes("not started")) return "bg-rose-50 text-rose-700"; return "bg-slate-100 text-slate-600"; };
  async function toggle(key: string, done: boolean) { try { await api.post(`/instructors/me/skills`, { key, done }); onChange(); } catch (e: any) { alert(e.message); } }
  return (
    <div className="space-y-5">
      {skills.list?.length > 0 && (
        <div className="card p-6"><h2 className="mb-3 font-semibold">{skills.track} · {skills.done}/{skills.list.length}</h2>
          <ul className="divide-y divide-slate-100">{skills.list.map((s: any) => (
            <li key={s.key} className="flex items-center gap-2 py-2 text-sm">
              <input type="checkbox" checked={s.done} onChange={(e) => toggle(s.key, e.target.checked)} />
              <span className={s.done ? "text-slate-700" : "text-slate-500"}>{s.label}</span>
            </li>
          ))}</ul>
        </div>
      )}
      {modules.length > 0 && (
        <div className="card p-6"><h2 className="mb-1 font-semibold">Module progress {skills.track ? `· ${skills.track}` : ""}</h2>
          <p className="mb-4 text-xs text-slate-400">{modules.filter((m: any) => /complete/i.test(m.status)).length}/{modules.length} completed</p>
          <ul className="divide-y divide-slate-100">{modules.map((m: any) => <li key={m.name} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="text-slate-700">{m.name}</span><span className={`chip ${tone(m.status)}`}>{m.status}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}
