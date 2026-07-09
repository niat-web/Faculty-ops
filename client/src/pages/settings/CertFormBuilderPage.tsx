import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, ArrowUp, ArrowDown, GripVertical, Save, X, GraduationCap } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { useConfirm } from "../../confirm";
import { FormSkeleton } from "../../components/skeletons";
import Modal from "../../components/Modal";
import ScrollSelect from "../../components/ScrollSelect";
import { FIELD_TYPES, TYPE_LABEL, HAS_OPTIONS, ACCEPT_PRESETS, fieldKey, type CertSchema, type CertField, type CertFieldType } from "../../certForm";

// Ops-only builder for the public Certificates form. Add / edit / reorder sections and fields, pick each
// field's type, options, allowed file types and placement — no developer needed. Saves the schema.
export default function CertFormBuilderPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [schema, setSchema] = useState<CertSchema | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ field: CertField; isNew: boolean } | null>(null);

  useEffect(() => { api.get("/certifications/schema").then((r) => setSchema(r.schema)).catch((e) => toast.error(e.message)); }, []);

  const mutate = (fn: (s: CertSchema) => CertSchema) => { setSchema((s) => (s ? fn(structuredClone(s)) : s)); setDirty(true); };

  async function save() {
    if (!schema) return;
    setSaving(true);
    try { const r = await api.post("/certifications/schema", { schema }); setSchema(r.schema); setDirty(false); toast.success("Form saved. The public form is updated."); }
    catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  // ── section ops ──
  const addSection = () => mutate((s) => { s.sections.push({ id: `section-${Date.now()}`, title: `Section ${s.sections.length + 1}` }); return s; });
  const renameSection = (id: string, title: string) => mutate((s) => { const sec = s.sections.find((x) => x.id === id); if (sec) sec.title = title; return s; });
  const moveSection = (idx: number, dir: -1 | 1) => mutate((s) => { const j = idx + dir; if (j < 0 || j >= s.sections.length) return s; [s.sections[idx], s.sections[j]] = [s.sections[j], s.sections[idx]]; return s; });
  async function deleteSection(id: string) {
    const count = schema!.fields.filter((f) => f.sectionId === id).length;
    if (!(await confirm({ title: "Delete section?", message: count ? `This also deletes ${count} field(s) in it.` : "Delete this section?", confirmText: "Delete", danger: true }))) return;
    mutate((s) => { s.sections = s.sections.filter((x) => x.id !== id); s.fields = s.fields.filter((f) => f.sectionId !== id); return s; });
  }

  // ── field ops ──
  const addField = (sectionId: string) => setEditing({ isNew: true, field: { id: `f-${Date.now()}`, key: "", label: "", type: "TEXT", sectionId } });
  const saveField = (field: CertField) => {
    mutate((s) => {
      const key = field.key || fieldKey(field.label) || `field_${s.fields.length + 1}`;
      const next = { ...field, key };
      const i = s.fields.findIndex((f) => f.id === field.id);
      if (i >= 0) s.fields[i] = next; else s.fields.push(next);
      return s;
    });
    setEditing(null);
  };
  async function deleteField(id: string) {
    if (!(await confirm({ title: "Delete field?", message: "Remove this field from the form?", confirmText: "Delete", danger: true }))) return;
    mutate((s) => { s.fields = s.fields.filter((f) => f.id !== id); return s; });
  }
  // Move a field up/down within its own section (order = position in the fields array).
  const moveField = (id: string, dir: -1 | 1) => mutate((s) => {
    const sectionId = s.fields.find((f) => f.id === id)?.sectionId;
    const idxs = s.fields.map((f, i) => (f.sectionId === sectionId ? i : -1)).filter((i) => i >= 0);
    const pos = idxs.findIndex((i) => s.fields[i].id === id);
    const target = idxs[pos + dir];
    if (target === undefined) return s;
    const cur = idxs[pos];
    [s.fields[cur], s.fields[target]] = [s.fields[target], s.fields[cur]];
    return s;
  });

  if (!schema) return <FormSkeleton />;

  return (
    <div className="space-y-5 pb-16">
      <Link to="/app/settings/operations" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Operations settings</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><GraduationCap className="h-6 w-6 text-brand-600" /> Edit Certificates form</h1>
          <p className="text-sm text-slate-500">Design the public form — add sections and fields, choose each field's type, options and placement. Changes apply to the live form when you save.</p>
        </div>
        <button onClick={save} disabled={saving || !dirty} className="btn btn-primary btn-sm disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
      </div>

      {schema.sections.map((sec, si) => {
        const fields = schema.fields.filter((f) => f.sectionId === sec.id);
        return (
          <div key={sec.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <div className="flex items-center gap-1 text-slate-400">
                <button onClick={() => moveSection(si, -1)} disabled={si === 0} className="rounded p-0.5 hover:bg-slate-200 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => moveSection(si, 1)} disabled={si === schema.sections.length - 1} className="rounded p-0.5 hover:bg-slate-200 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              </div>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{si + 1}</span>
              <input value={sec.title} onChange={(e) => renameSection(sec.id, e.target.value)} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-800 hover:border-slate-200 focus:border-brand-400 focus:bg-white focus:outline-none" placeholder="Section title" />
              <button onClick={() => deleteSection(sec.id)} title="Delete section" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>

            <ul className="divide-y divide-slate-100">
              {fields.map((f, fi) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                  <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                  <div className="flex items-center gap-1 text-slate-400">
                    <button onClick={() => moveField(f.id, -1)} disabled={fi === 0} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => moveField(f.id, 1)} disabled={fi === fields.length - 1} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{f.label || "(no label)"}</span>
                      {f.required && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600">required</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">{TYPE_LABEL[f.type]}</span>
                      <span className="font-mono">{f.key}</span>
                      {HAS_OPTIONS(f.type) && <span>· {(f.options || []).length} option(s)</span>}
                      {f.type === "FILE" && <span>· {f.accept || "image/*"}</span>}
                    </div>
                  </div>
                  <button onClick={() => setEditing({ isNew: false, field: f })} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => deleteField(f.id)} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
              {!fields.length && <li className="px-4 py-4 text-center text-sm text-slate-400">No fields yet.</li>}
            </ul>
            <div className="border-t border-slate-100 p-2.5">
              <button onClick={() => addField(sec.id)} className="btn btn-ghost btn-sm border border-dashed border-slate-300 text-slate-600"><Plus className="h-4 w-4" /> Add field</button>
            </div>
          </div>
        );
      })}

      <button onClick={addSection} className="btn btn-ghost btn-sm border border-dashed border-slate-300 text-slate-600"><Plus className="h-4 w-4" /> Add section</button>

      {editing && <FieldModal state={editing} onClose={() => setEditing(null)} onSave={saveField} />}

      {/* Sticky save bar when there are unsaved changes. */}
      {dirty && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-lg">
          <span className="text-sm text-slate-600">Unsaved changes</span>
          <button onClick={() => navigate("/app/settings/operations")} className="btn btn-ghost btn-sm">Discard</button>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}</button>
        </div>
      )}
    </div>
  );
}

function FieldModal({ state, onClose, onSave }: { state: { field: CertField; isNew: boolean }; onClose: () => void; onSave: (f: CertField) => void }) {
  const [f, setF] = useState<CertField>({ ...state.field, options: state.field.options ? [...state.field.options] : [] });
  const set = (patch: Partial<CertField>) => setF((p) => ({ ...p, ...patch }));
  const showOptions = HAS_OPTIONS(f.type);

  function addOption() { set({ options: [...(f.options || []), ""] }); }
  function setOption(i: number, v: string) { const o = [...(f.options || [])]; o[i] = v; set({ options: o }); }
  function delOption(i: number) { set({ options: (f.options || []).filter((_, k) => k !== i) }); }

  function submit() {
    if (!f.label.trim()) return;
    const opts = showOptions ? (f.options || []).map((s) => s.trim()).filter(Boolean) : undefined;
    onSave({ ...f, label: f.label.trim(), key: f.key || fieldKey(f.label), options: opts, accept: f.type === "FILE" ? (f.accept || "image/*") : undefined });
  }

  return (
    <Modal title={state.isNew ? "Add field" : "Edit field"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Question / label</label>
          <input autoFocus className="input" value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Year of Passing" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Field type</label>
            <ScrollSelect value={f.type} onChange={(v) => set({ type: v as CertFieldType })} options={FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
            <p className="mt-1 text-xs text-slate-400">{FIELD_TYPES.find((t) => t.value === f.type)?.hint}</p>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 self-end rounded-lg border border-slate-200 px-4 py-2.5">
            <span className="text-sm font-medium text-slate-700">Required</span>
            <button type="button" role="switch" aria-checked={!!f.required} onClick={() => set({ required: !f.required })} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${f.required ? "bg-brand-600" : "bg-slate-300"}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${f.required ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </label>
        </div>

        {showOptions && (
          <div>
            <label className="label">Options</label>
            <div className="space-y-2">
              {(f.options || []).map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input" value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                  <button onClick={() => delOption(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button onClick={addOption} className="btn btn-ghost btn-sm border border-dashed border-slate-300"><Plus className="h-4 w-4" /> Add option</button>
            </div>
          </div>
        )}

        {f.type === "FILE" && (
          <div>
            <label className="label">Allowed file types</label>
            <ScrollSelect value={f.accept || "image/*"} onChange={(v) => set({ accept: v })} options={ACCEPT_PRESETS.map((a) => ({ value: a.value, label: a.label }))} />
          </div>
        )}

        {f.type !== "FILE" && f.type !== "EMPLOYEE" && (
          <div>
            <label className="label">Placeholder <span className="text-slate-400">(optional)</span></label>
            <input className="input" value={f.placeholder || ""} onChange={(e) => set({ placeholder: e.target.value })} placeholder="Hint shown inside the box" />
          </div>
        )}

        <div>
          <label className="label">Helper text <span className="text-slate-400">(optional)</span></label>
          <input className="input" value={f.help || ""} onChange={(e) => set({ help: e.target.value })} placeholder="Small note shown under the field" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={submit} disabled={!f.label.trim()} className="btn btn-primary btn-sm disabled:opacity-50">{state.isNew ? "Add field" : "Save field"}</button>
        </div>
      </div>
    </Modal>
  );
}
