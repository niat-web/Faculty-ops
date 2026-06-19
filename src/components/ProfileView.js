"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, FileUp, Clock, MessageSquarePlus, CheckCircle2, Circle,
  RotateCcw, UploadCloud, FileText, Printer, Trash2, History,
} from "lucide-react";
import { MODULE_ORDER, MODULE_LABEL, LIFECYCLE_LABEL, LIFECYCLE_ORDER } from "@/lib/enums.js";
import { EXIT_TYPES } from "@/lib/catalog.js";
import { useUI } from "./UIProvider.js";

const VIS_CHIP = { PUBLIC: "chip-public", NECESSARY: "chip-necessary", SENSITIVE: "chip-sensitive" };

export default function ProfileView({ profile, caps, audit }) {
  const { instructor, byModule, skills, exit, documents } = profile;
  const router = useRouter();
  // LIFECYCLE & EXIT have dedicated tabs (timeline / offboarding), so don't also
  // generate a generic field-tab for them — that caused a duplicate menu item.
  const moduleTabs = MODULE_ORDER.filter((m) => m !== "LIFECYCLE" && m !== "EXIT" && byModule[m]?.length);
  const tabs = [
    ...moduleTabs,
    ...(skills?.list?.length || skills?.moduleStatus?.length ? ["SKILLS"] : []),
    "NOTES", "LIFECYCLE",
    ...(caps.viewSensitive ? ["EXIT", "DOCUMENTS"] : []),
    ...(caps.viewAudit ? ["AUDIT"] : []),
  ];
  const [tab, setTab] = useState(moduleTabs[0] || "SKILLS");
  const [editing, setEditing] = useState(null);

  const label = (t) => MODULE_LABEL[t] || ({ SKILLS: "Skills", NOTES: "Notes", LIFECYCLE: "Lifecycle", EXIT: "Exit", DOCUMENTS: "Documents", AUDIT: "Audit" }[t]);

  return (
    <div className="space-y-5">
      <Link href="/app/instructors" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> All instructors
      </Link>

      <div className="card flex flex-wrap items-center gap-4 p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-2xl font-bold text-brand-700">
          {instructor.name.charAt(0)}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{instructor.name}</h1>
          <p className="text-sm text-slate-500">
            <span className="font-mono">{instructor.employeeId}</span> · {instructor.campus || "no campus"} · Manager: {instructor.managerName}
          </p>
        </div>
        <span className="chip chip-status text-sm">{LIFECYCLE_LABEL[instructor.status] || instructor.status}</span>
        <Link href={`/app/instructors/${instructor.id}/history`} className="btn btn-ghost btn-sm"><History className="h-4 w-4" /> History</Link>
        <a href={`/print/instructors/${instructor.id}`} target="_blank" className="btn btn-ghost btn-sm"><Printer className="h-4 w-4" /> Report Card</a>
        {caps.editDirectly && instructor.status === "EXITED" && <RehireButton instructorId={instructor.id} onDone={() => router.refresh()} />}
        {caps.editDirectly && <LifecycleControl instructorId={instructor.id} current={instructor.status} />}
        {caps.canDelete && <DeleteInstructorButton instructorId={instructor.id} name={instructor.name} />}
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Left: section navigation */}
        <nav className="shrink-0 lg:w-56">
          <div className="card overflow-hidden p-2 lg:sticky lg:top-2">
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  tab === t ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}>
                {label(t)}
              </button>
            ))}
          </div>
        </nav>

        {/* Right: section content */}
        <div className="min-w-0 flex-1 space-y-5">
          {moduleTabs.includes(tab) && (
            <div className="card divide-y divide-slate-100">
              {byModule[tab].map((f) => (
                <div key={f.key} className="flex items-center justify-between px-6 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{f.label}</span>
                    <span className={`chip ${VIS_CHIP[f.visibility]}`}>{f.visibility.toLowerCase()}</span>
                    {f.scope === "INSTANCE" && <span className="chip chip-gray">instance</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900">{f.value ?? "—"}</span>
                    {(caps.editDirectly || caps.requestEdit) && (
                      <button onClick={() => setEditing(f)} className="btn btn-ghost btn-sm">
                        <Pencil className="h-3.5 w-3.5" /> {caps.editDirectly ? "Edit" : "Request"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "SKILLS" && <SkillsTab instructorId={instructor.id} skills={skills} canEdit={caps.editDirectly} onChange={() => router.refresh()} />}
          {tab === "NOTES" && <NotesTab instructor={instructor} onAdded={() => router.refresh()} />}
          {tab === "LIFECYCLE" && <LifecycleTab instructor={instructor} />}
          {tab === "EXIT" && caps.viewSensitive && <ExitTab instructorId={instructor.id} exit={exit} canEdit={caps.editDirectly} onSaved={() => router.refresh()} />}
          {tab === "DOCUMENTS" && caps.viewSensitive && <DocumentsTab instructorId={instructor.id} documents={documents} canEdit={caps.editDirectly} onChange={() => router.refresh()} />}
          {tab === "AUDIT" && caps.viewAudit && <AuditTab audit={audit} />}
        </div>
      </div>

      {editing && (
        <FieldEditModal instructorId={instructor.id} field={editing} mode={caps.editDirectly ? "edit" : "request"}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); router.refresh(); }} />
      )}
    </div>
  );
}

function SkillsTab({ instructorId, skills, canEdit, onChange }) {
  const [busy, setBusy] = useState(null);
  async function toggle(s) {
    if (!canEdit) return;
    setBusy(s.key);
    await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorId, key: s.key, label: `${skills.track} — ${s.label}`, done: !s.done }) });
    setBusy(null); onChange();
  }
  const modules = skills.moduleStatus || [];
  if (!skills.track && !modules.length) return <div className="card p-8 text-center text-sm text-slate-400">No training data.</div>;
  const pct = skills.list.length ? Math.round((skills.done / skills.list.length) * 100) : 0;
  const statusTone = (s) => {
    const t = String(s || "").toLowerCase();
    if (t.includes("complete")) return "bg-emerald-50 text-emerald-700";
    if (t.includes("progress")) return "bg-amber-50 text-amber-700";
    if (t.includes("hold")) return "bg-slate-100 text-slate-600";
    if (t.includes("not started")) return "bg-rose-50 text-rose-700";
    return "bg-slate-100 text-slate-600";
  };
  return (
    <div className="space-y-5">
      {skills.list.length > 0 && (
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{skills.track}</h2>
              <p className="text-xs text-slate-400">{skills.done}/{skills.list.length} skills complete</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
              <span className="text-sm font-semibold">{pct}%</span>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {skills.list.map((s) => (
              <li key={s.key} className="flex items-center gap-3 py-2.5">
                <button disabled={!canEdit || busy === s.key} onClick={() => toggle(s)} className={canEdit ? "cursor-pointer" : "cursor-default"}>
                  {s.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300" />}
                </button>
                <span className={`text-sm ${s.done ? "text-slate-700" : "text-slate-500"}`}>{s.label}</span>
              </li>
            ))}
          </ul>
          {!canEdit && <p className="mt-3 text-xs text-slate-400">Read-only — only Senior Managers / Ops Admins can update skills.</p>}
        </div>
      )}

      {modules.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-1 font-semibold">Module progress {skills.track ? `· ${skills.track}` : ""}</h2>
          <p className="mb-4 text-xs text-slate-400">{modules.filter((m) => /complete/i.test(m.status)).length}/{modules.length} modules completed</p>
          <ul className="divide-y divide-slate-100">
            {modules.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-slate-700">{m.name}</span>
                <span className={`chip ${statusTone(m.status)}`}>{m.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ExitTab({ instructorId, exit, canEdit, onSaved }) {
  const [form, setForm] = useState(exit);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleItem = (key) => setForm((f) => ({ ...f, items: f.items.map((i) => i.key === key ? { ...i, done: !i.done } : i) }));
  async function save() {
    setBusy(true); setMsg(null);
    const items = Object.fromEntries(form.items.map((i) => [i.key, i.done]));
    const res = await fetch("/api/exit", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorId, lastWorkingDay: form.lastWorkingDay, typeOfExit: form.typeOfExit, reason: form.reason, detailedReason: form.detailedReason, items }) });
    setBusy(false);
    if (res.ok) { setMsg("Saved"); onSaved(); } else setMsg("Failed");
  }
  const doneCount = form.items.filter((i) => i.done).length;
  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Exit details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Last working day</label><input type="date" className="input" value={form.lastWorkingDay || ""} disabled={!canEdit} onChange={(e) => set("lastWorkingDay", e.target.value)} /></div>
          <div><label className="label">Type of exit</label>
            <select className="input" value={form.typeOfExit || ""} disabled={!canEdit} onChange={(e) => set("typeOfExit", e.target.value)}>
              <option value="">—</option>{EXIT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="label">Reason</label><input className="input" value={form.reason || ""} disabled={!canEdit} onChange={(e) => set("reason", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="label">Detailed reason</label><textarea rows={2} className="input" value={form.detailedReason || ""} disabled={!canEdit} onChange={(e) => set("detailedReason", e.target.value)} /></div>
        </div>
      </div>
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Offboarding checklist</h2>
          <span className="text-xs text-slate-400">{doneCount}/{form.items.length} done</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {form.items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 py-2.5">
              <button disabled={!canEdit} onClick={() => toggleItem(i.key)}>
                {i.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300" />}
              </button>
              <span className={`text-sm ${i.done ? "text-slate-700" : "text-slate-500"}`}>{i.label}</span>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="mt-4 flex items-center gap-3">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save exit details"}</button>
            {msg && <span className="text-sm text-slate-400">{msg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentsTab({ instructorId, documents, canEdit, onChange }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function upload(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.set("instructorId", instructorId);
    if (!fd.get("file") || !fd.get("file").size) return;
    setBusy(true);
    const res = await fetch("/api/documents", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) { e.target.reset(); onChange(); ui.toast("Document uploaded"); } else ui.toast("Upload failed", "error");
  }
  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={upload} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[180px] flex-1"><label className="label">Document name</label><input name="name" className="input" placeholder="e.g. Degree Certificate" /></div>
          <div><label className="label">File (image / PDF)</label><input name="file" type="file" accept="image/*,application/pdf" className="input" required /></div>
          <button className="btn btn-primary btn-sm" disabled={busy}><UploadCloud className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}</button>
        </form>
      )}
      <div className="card divide-y divide-slate-100">
        {documents.length === 0 && <p className="px-6 py-8 text-center text-sm text-slate-400">No documents uploaded.</p>}
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-slate-400" />
              <div><div className="text-sm font-medium">{d.name}</div><div className="text-xs text-slate-400">{d.uploadedByName} · {new Date(d.createdAt).toLocaleDateString()}</div></div>
            </div>
            <a href={`/api/documents/file?instructorId=${instructorId}&path=${encodeURIComponent(d.path)}`} target="_blank" className="text-sm text-brand-600 hover:underline">View</a>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesTab({ instructor, onAdded }) {
  const ui = useUI();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const fd = new FormData(); fd.set("instructorId", instructor.id); fd.set("body", body);
    const res = await fetch("/api/notes", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) { setBody(""); onAdded(); ui.toast("Note added"); } else ui.toast("Failed to add note", "error");
  }
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card p-4">
        <label className="label">Add a note</label>
        <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a timestamped remark…" />
        <div className="mt-2 text-right"><button className="btn btn-primary btn-sm" disabled={busy}><MessageSquarePlus className="h-4 w-4" /> Add note</button></div>
      </form>
      <div className="card divide-y divide-slate-100">
        {instructor.notes.length === 0 && <p className="px-6 py-8 text-center text-sm text-slate-400">No notes yet.</p>}
        {instructor.notes.map((n) => (
          <div key={n.id} className="px-6 py-3.5">
            <p className="text-sm text-slate-700">{n.body}</p>
            <p className="mt-1 text-xs text-slate-400">{n.authorName} · {new Date(n.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LifecycleTab({ instructor }) {
  return (
    <div className="card p-6">
      <ol className="relative space-y-6 border-l-2 border-slate-100 pl-6">
        {instructor.lifecycle.map((l, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 ring-4 ring-brand-50" />
            <div className="flex items-center gap-2">
              <span className="chip chip-status">{LIFECYCLE_LABEL[l.status] || l.status}</span>
              <span className="text-xs text-slate-400">{new Date(l.createdAt).toLocaleString()}</span>
            </div>
            {l.note && <p className="mt-1 text-sm text-slate-600">{l.note}</p>}
            <p className="text-xs text-slate-400">by {l.actorName}</p>
          </li>
        ))}
        {instructor.lifecycle.length === 0 && <p className="text-sm text-slate-400">No lifecycle history.</p>}
      </ol>
    </div>
  );
}

function AuditTab({ audit }) {
  return (
    <div className="card divide-y divide-slate-100">
      {(!audit || audit.length === 0) && <p className="px-6 py-8 text-center text-sm text-slate-400">No audit entries.</p>}
      {audit?.map((a) => (
        <div key={a.id} className="px-6 py-3.5 text-sm">
          <div className="flex items-center justify-between">
            <span><span className="font-medium">{a.actorName}</span> <span className="chip chip-gray">{a.action.replace(/_/g, " ").toLowerCase()}</span></span>
            <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
          </div>
          {a.fieldName && <p className="mt-1 text-slate-600">{a.fieldName}: <span className="text-slate-400">{a.oldValue ?? "—"}</span> → <span className="font-medium">{a.newValue ?? "—"}</span></p>}
          {a.reason && <p className="text-xs text-slate-400">Reason: {a.reason}</p>}
          {a.proofPath && <a href={`/api/proof?path=${encodeURIComponent(a.proofPath)}`} className="text-xs text-brand-600 hover:underline">View proof</a>}
        </div>
      ))}
    </div>
  );
}

function DeleteInstructorButton({ instructorId, name }) {
  const router = useRouter();
  const ui = useUI();
  async function del() {
    const ok = await ui.confirm({ title: `Delete ${name}?`, message: "This permanently removes the instructor and their pending requests. This cannot be undone.", confirmText: "Delete", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/instructors/${instructorId}`, { method: "DELETE" });
    if (res.ok) { ui.toast("Instructor deleted"); router.push("/app/instructors"); }
    else { const j = await res.json().catch(() => ({})); ui.toast(j.error || "Failed", "error"); }
  }
  return <button onClick={del} className="btn btn-danger btn-sm"><Trash2 className="h-4 w-4" /> Delete</button>;
}

function RehireButton({ instructorId, onDone }) {
  const ui = useUI();
  async function rehire() {
    const note = await ui.prompt({ title: "Re-hire instructor?", message: "Their full history is preserved.", placeholder: "Optional note", confirmText: "Re-hire" });
    if (note === null) return;
    const res = await fetch("/api/rehire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructorId, note }) });
    if (res.ok) { onDone(); ui.toast("Instructor re-hired"); }
    else { const j = await res.json().catch(() => ({})); ui.toast(j.error || "Failed", "error"); }
  }
  return <button onClick={rehire} className="btn btn-success btn-sm"><RotateCcw className="h-4 w-4" /> Re-hire</button>;
}

function LifecycleControl({ instructorId, current }) {
  const router = useRouter();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(current);
  const [note, setNote] = useState("");
  async function save() {
    const fd = new FormData(); fd.set("instructorId", instructorId); fd.set("status", status); fd.set("note", note);
    const res = await fetch("/api/lifecycle", { method: "POST", body: fd });
    if (res.ok) { setOpen(false); router.refresh(); ui.toast("Status updated"); } else ui.toast("Failed to update status", "error");
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn btn-ghost btn-sm"><Clock className="h-4 w-4" /> Change status</button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
          <label className="label">New status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {LIFECYCLE_ORDER.map((s) => <option key={s} value={s}>{LIFECYCLE_LABEL[s]}</option>)}
          </select>
          <label className="label mt-2">Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for change" />
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldEditModal({ instructorId, field, mode, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const fd = new FormData(e.target);
    fd.set("instructorId", instructorId); fd.set("fieldKey", field.key); fd.set("fieldLabel", field.label); fd.set("oldValue", field.value ?? "");
    const url = mode === "edit" ? "/api/fields/edit" : "/api/requests";
    const res = await fetch(url, { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) onDone();
    else { const j = await res.json().catch(() => ({})); setErr(j.error || "Something went wrong."); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">{mode === "edit" ? "Edit field" : "Request change"}</h3>
        <p className="mt-1 text-sm text-slate-500">{field.label}</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="label">New value</label>
            {field.type === "DROPDOWN" ? (
              <select name="newValue" className="input" defaultValue={field.value ?? ""}>
                <option value="">— select —</option>
                {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : field.type === "BOOLEAN" ? (
              <select name="newValue" className="input" defaultValue={field.value ?? ""}>
                <option value="">— select —</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            ) : (
              <input name="newValue" className="input" defaultValue={field.value ?? ""}
                type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"} required />
            )}
          </div>
          <div>
            <label className="label">{mode === "edit" ? "Reason / note (required)" : "Reason (required)"}</label>
            <textarea name="reason" rows={2} className="input" required />
          </div>
          {mode === "request" && (
            <div>
              <label className="label"><FileUp className="inline h-3.5 w-3.5" /> Proof document (image / PDF) — required</label>
              <input name="proof" type="file" accept="image/*,application/pdf" className="input" required />
            </div>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : mode === "edit" ? "Save change" : "Submit request"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
