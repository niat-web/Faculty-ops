"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Trash2, X } from "lucide-react";
import { useUI } from "./UIProvider.js";

const MODULES = ["PERSONAL", "HIRING", "TRAINING", "DEPLOYMENT", "PERFORMANCE", "LIFECYCLE", "EXIT"];
const TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN", "FILE", "BOOLEAN"];
const VIS = ["PUBLIC", "NECESSARY", "SENSITIVE"];
const VIS_CHIP = { PUBLIC: "chip-public", NECESSARY: "chip-necessary", SENSITIVE: "chip-sensitive" };

export default function FieldManager({ fields, isOps = false }) {
  const router = useRouter();
  const ui = useUI();
  const [editing, setEditing] = useState(null);

  async function archive(field) {
    const reason = await ui.prompt({ title: `Archive "${field.label}"?`, message: "Soft-delete (data retained). A reason is required.", placeholder: "Reason for archiving", confirmText: "Archive", danger: true });
    if (!reason) return;
    const fd = new FormData(); fd.set("fieldId", field.id); fd.set("reason", reason);
    const res = await fetch("/api/fields/archive", { method: "POST", body: fd });
    if (res.ok) { router.refresh(); ui.toast("Field archived"); }
    else { const j = await res.json().catch(() => ({})); ui.toast(j.error || "Failed", "error"); }
  }

  async function remove(field) {
    const ok = await ui.confirm({ title: `Delete "${field.label}"?`, message: `Permanently deletes this field and removes its value from ${field.valueCount} instructor(s). This cannot be undone.`, confirmText: "Delete permanently", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/fields/${field.id}`, { method: "DELETE" });
    if (res.ok) { router.refresh(); ui.toast("Field deleted"); }
    else { const j = await res.json().catch(() => ({})); ui.toast(j.error || "Failed", "error"); }
  }

  const [fModule, setFModule] = useState("");
  const [fVis, setFVis] = useState("");
  const [fQ, setFQ] = useState("");

  const matches = (f) =>
    (!fModule || f.module === fModule) &&
    (!fVis || f.visibility === fVis) &&
    (!fQ || f.label.toLowerCase().includes(fQ.toLowerCase()));

  const active = fields.filter((f) => !f.archivedAt && matches(f));
  const archived = fields.filter((f) => f.archivedAt && matches(f));

  return (
    <>
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[180px] flex-1">
          <label className="label">Search</label>
          <input className="input" value={fQ} onChange={(e) => setFQ(e.target.value)} placeholder="Field label…" />
        </div>
        <div>
          <label className="label">Module</label>
          <select className="input w-44" value={fModule} onChange={(e) => setFModule(e.target.value)}>
            <option value="">All modules</option>
            {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Visibility</label>
          <select className="input w-40" value={fVis} onChange={(e) => setFVis(e.target.value)}>
            <option value="">All</option>
            {VIS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">Active fields ({active.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Label</th><th className="px-5 py-3">Module</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Visibility</th><th className="px-5 py-3">Scope</th><th className="px-5 py-3">Values</th><th className="px-5 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{f.label}</td>
                  <td className="px-5 py-3 text-slate-500">{f.module}</td>
                  <td className="px-5 py-3 text-slate-500">{f.type}</td>
                  <td className="px-5 py-3"><span className={`chip ${VIS_CHIP[f.visibility]}`}>{f.visibility.toLowerCase()}</span></td>
                  <td className="px-5 py-3 text-slate-500">{f.scope === "INSTANCE" ? `Instance · ${f.instructorName}` : "Global"}</td>
                  <td className="px-5 py-3">{f.valueCount}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isOps && <button onClick={() => setEditing(f)} title="Edit field" className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>}
                      <button onClick={() => archive(f)} title="Archive (soft-delete, retained)" className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600"><Archive className="h-4 w-4" /></button>
                      {isOps && <button onClick={() => remove(f)} title="Delete permanently" className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {archived.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">Archived ({archived.length}) — retained for compliance</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Label</th><th className="px-5 py-3">Module</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Archived</th>{isOps && <th className="px-5 py-3 text-right">Actions</th>}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {archived.map((f) => (
                <tr key={f.id}>
                  <td className="px-5 py-3">{f.label}</td>
                  <td className="px-5 py-3 text-slate-500">{f.module}</td>
                  <td className="px-5 py-3 text-slate-400">{f.archiveReason}</td>
                  <td className="px-5 py-3 text-slate-400">{new Date(f.archivedAt).toLocaleDateString()}</td>
                  {isOps && <td className="px-5 py-3 text-right"><button onClick={() => remove(f)} title="Delete permanently" className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditFieldModal
          field={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); router.refresh(); ui.toast("Field updated"); }}
          onError={(m) => ui.toast(m, "error")}
        />
      )}
    </>
  );
}

function EditFieldModal({ field, onClose, onDone, onError }) {
  const [type, setType] = useState(field.type);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      label: fd.get("label"),
      module: fd.get("module"),
      type: fd.get("type"),
      visibility: fd.get("visibility"),
      options: fd.get("options") || "",
      min: fd.get("min") || "",
      max: fd.get("max") || "",
      pattern: fd.get("pattern") || "",
    };
    setBusy(true);
    const res = await fetch(`/api/fields/${field.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) onDone();
    else { const j = await res.json().catch(() => ({})); onError(j.error || "Failed to update"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Edit field</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Label</label><input name="label" className="input" defaultValue={field.label} required autoFocus /></div>
          <div>
            <label className="label">Module</label>
            <select name="module" className="input" defaultValue={field.module}>{MODULES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </div>
          <div>
            <label className="label">Type</label>
            <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div>
            <label className="label">Visibility</label>
            <select name="visibility" className="input" defaultValue={field.visibility}>{VIS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </div>
          {type === "DROPDOWN" && (
            <div className="sm:col-span-2"><label className="label">Options (comma-separated)</label><input name="options" className="input" defaultValue={(field.options || []).join(", ")} /></div>
          )}
          {type === "NUMBER" && (
            <>
              <div><label className="label">Min</label><input name="min" type="number" className="input" defaultValue={field.min ?? ""} /></div>
              <div><label className="label">Max</label><input name="max" type="number" className="input" defaultValue={field.max ?? ""} /></div>
            </>
          )}
          {type === "TEXT" && (
            <div className="sm:col-span-2"><label className="label">Regex pattern (optional)</label><input name="pattern" className="input" defaultValue={field.pattern || ""} placeholder="e.g. ^[0-9]{10}$" /></div>
          )}
          <p className="text-xs text-slate-400 sm:col-span-2">The internal key (<span className="font-mono">{field.key}</span>) stays the same, so existing values remain attached.</p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
