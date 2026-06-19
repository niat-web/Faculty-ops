"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useUI } from "./UIProvider.js";

const MODULES = ["PERSONAL", "HIRING", "TRAINING", "DEPLOYMENT", "PERFORMANCE", "LIFECYCLE", "EXIT"];
const TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN", "FILE", "BOOLEAN"];
const VIS = ["PUBLIC", "NECESSARY", "SENSITIVE"];

// "Add field" header button → opens a modal with the create form.
export default function AddFieldButton({ instructors }) {
  const router = useRouter();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("GLOBAL");
  const [type, setType] = useState("TEXT");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function addField(e) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.target);
    setBusy(true);
    const res = await fetch("/api/fields/define", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) { setOpen(false); setScope("GLOBAL"); setType("TEXT"); router.refresh(); ui.toast("Field added"); }
    else { const j = await res.json().catch(() => ({})); setErr(j.error || "Failed"); }
  }

  return (
    <>
      <button onClick={() => { setErr(null); setOpen(true); }} className="btn btn-primary btn-sm">
        <Plus className="h-4 w-4" /> Add field
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add a field</h3>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={addField} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Label</label>
                <input name="label" className="input" required autoFocus placeholder="e.g. Certificate Expiry" />
              </div>
              <div>
                <label className="label">Module</label>
                <select name="module" className="input">{MODULES.map((m) => <option key={m}>{m}</option>)}</select>
              </div>
              <div>
                <label className="label">Type</label>
                <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Visibility (required — never defaults to all)</label>
                <select name="visibility" className="input" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {VIS.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>
              {type === "DROPDOWN" && (
                <div className="sm:col-span-2">
                  <label className="label">Dropdown options (comma-separated)</label>
                  <input name="options" className="input" placeholder="Option A, Option B, Option C" />
                </div>
              )}
              {type === "NUMBER" && (
                <>
                  <div><label className="label">Min value (optional)</label><input name="min" type="number" className="input" placeholder="e.g. 0" /></div>
                  <div><label className="label">Max value (optional)</label><input name="max" type="number" className="input" placeholder="e.g. 100" /></div>
                </>
              )}
              {type === "TEXT" && (
                <div className="sm:col-span-2">
                  <label className="label">Validation pattern — regex (optional)</label>
                  <input name="pattern" className="input" placeholder="e.g. ^[0-9]{10}$ for a 10-digit phone" />
                </div>
              )}
              <div>
                <label className="label">Apply scope</label>
                <select name="scope" className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="GLOBAL">All instructors</option>
                  <option value="INSTANCE">This instructor only</option>
                </select>
              </div>
              {scope === "INSTANCE" && (
                <div>
                  <label className="label">Instructor</label>
                  <select name="instructorId" className="input" required>
                    <option value="">Choose…</option>
                    {instructors.map((i) => <option key={i.id} value={i.id}>{i.employeeId} — {i.name}</option>)}
                  </select>
                </div>
              )}
              {err && <p className="text-sm text-rose-600 sm:col-span-2">{err}</p>}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={busy}><Plus className="h-4 w-4" /> {busy ? "Adding…" : "Add field"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
