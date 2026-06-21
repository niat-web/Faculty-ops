import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Archive, BookOpen, ChevronRight } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import { useConfirm, usePrompt } from "../confirm";
import Modal from "../components/Modal";
import ScrollSelect from "../components/ScrollSelect";

const TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN", "FILE", "BOOLEAN"];
const VIS = ["PUBLIC", "NECESSARY", "SENSITIVE"];
const VIS_CHIP: Record<string, string> = { PUBLIC: "chip-public", NECESSARY: "chip-necessary", SENSITIVE: "chip-sensitive" };

export default function FieldsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isOps = user!.role === "OPS_ADMIN";
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [archiving, setArchiving] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [visF, setVisF] = useState("");
  const [tracks, setTracks] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("__training__"); // left-nav selection (default: Training Stats columns)

  function load() { api.get("/fields").then(setData).catch((e) => toast.error(e.message || "Failed to load fields")); }
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get("/training/tracks").then((r) => setTracks(r.tracks)).catch(() => {}); }, []);

  async function del(f: any) {
    if (!(await confirm({ title: "Delete field?", message: `Permanently delete "${f.label}" and strip its value from all instructors? This cannot be undone.` }))) return;
    try { await api.del(`/fields/${f.id}`); load(); } catch (e: any) { toast.error(e.message); }
  }

  const sx = search.trim().toLowerCase();
  const modules: any[] = data?.modules || [];
  const modLabel = (k: string) => modules.find((m) => m.key === k)?.label || k;
  const allActive: any[] = (data?.fields || []).filter((f: any) => !f.archivedAt);
  const archived: any[] = (data?.fields || []).filter((f: any) => f.archivedAt);
  const countFor = (k: string) => allActive.filter((f) => f.module === k).length;
  // Right-pane fields for the selected module (with search + visibility filter).
  const moduleFields = allActive.filter((f) => f.module === selected && (!sx || f.label.toLowerCase().includes(sx) || f.key.toLowerCase().includes(sx)) && (!visF || f.visibility === visF));
  const navItem = (on: boolean) => `flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${on ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Dynamic Fields</h1><p className="text-sm text-slate-500">Define the fields tracked on every instructor profile.</p></div>
        {isOps && <button onClick={() => setEditing({})} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Define field</button>}
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* LEFT — sections list */}
        <div className="lg:w-[28%]">
          <div className="card p-2">
            <button onClick={() => setSelected("__training__")} className={navItem(selected === "__training__")}>
              <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-brand-600" /> Training Stats columns</span>
            </button>
            <div className="my-1 border-t border-slate-100" />
            {modules.map((m) => (
              <button key={m.key} onClick={() => setSelected(m.key)} className={navItem(selected === m.key)}>
                <span className="truncate">{m.label}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{countFor(m.key)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — detail for the selection */}
        <div className="min-w-0 lg:w-[72%]">
          {selected === "__training__" ? (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-600"><BookOpen className="h-4 w-4 text-brand-600" /> Training Stats columns</div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-2">Track</th><th className="px-5 py-2">Columns</th><th className="px-5 py-2"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {tracks.map((t) => (
                    <tr key={t.key} onClick={() => navigate(`/app/settings/fields/training/${t.key}`)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-brand-700">{t.label}</td>
                      <td className="px-5 py-3 text-slate-500">{t.columns} column(s)</td>
                      <td className="px-5 py-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-slate-400" /></td>
                    </tr>
                  ))}
                  {!tracks.length && <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">Loading tracks…</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input className="input min-w-[200px] flex-1" placeholder="Search label or key…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className="input w-44" value={visF} onChange={(e) => setVisF(e.target.value)}><option value="">All visibility</option>{VIS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              </div>
              <div className="card overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-600">{modLabel(selected)}</div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-2">Label</th><th className="px-5 py-2">Type</th><th className="px-5 py-2">Visibility</th><th className="px-5 py-2">Scope</th><th className="px-5 py-2">In use</th><th className="px-5 py-2"></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {moduleFields.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 font-medium">{f.label}<span className="ml-2 font-mono text-[11px] text-slate-400">{f.key}</span></td>
                        <td className="px-5 py-2.5 text-slate-500">{f.type}{f.type === "DROPDOWN" && f.options?.length ? ` (${f.options.length})` : ""}</td>
                        <td className="px-5 py-2.5"><span className={`chip ${VIS_CHIP[f.visibility]}`}>{f.visibility.toLowerCase()}</span></td>
                        <td className="px-5 py-2.5 text-slate-500">{f.scope === "INSTANCE" ? `Instance · ${f.instructorName || "?"}` : "Global"}</td>
                        <td className="px-5 py-2.5 text-slate-500">{f.valueCount}</td>
                        <td className="px-5 py-2.5">
                          <div className="flex justify-end gap-1">
                            {isOps && <button title="Edit" onClick={() => setEditing(f)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>}
                            <button title="Archive" onClick={() => setArchiving(f)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600"><Archive className="h-4 w-4" /></button>
                            {isOps && <button title="Delete" onClick={() => del(f)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!moduleFields.length && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No fields in this module{sx || visF ? " match your filters" : " yet"}.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {archived.length > 0 && (
        <div>
          <button onClick={() => setShowArchived((s) => !s)} className="text-sm font-medium text-slate-500 hover:text-slate-800">{showArchived ? "▾" : "▸"} Archived fields ({archived.length})</button>
          {showArchived && (
            <div className="card mt-2 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {archived.map((f) => (
                    <tr key={f.id} className="text-slate-500">
                      <td className="px-5 py-2.5">{f.label} <span className="font-mono text-[11px]">{f.key}</span></td>
                      <td className="px-5 py-2.5">{modLabel(f.module)}</td>
                      <td className="px-5 py-2.5 text-xs italic">{f.archiveReason}</td>
                      {isOps && <td className="px-5 py-2.5 text-right"><button onClick={() => del(f)} className="text-rose-500 hover:underline">Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && <FieldModal field={editing} instructors={data?.instructors || []} modules={modules} isOps={isOps} reloadModules={load} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {archiving && <ArchiveModal field={archiving} onClose={() => setArchiving(null)} onDone={() => { setArchiving(null); load(); }} />}
    </div>
  );
}

function FieldModal({ field, instructors, modules, isOps, reloadModules, onClose, onSaved }: any) {
  const isNew = !field.id;
  const toast = useToast();
  const prompt = usePrompt();
  const [mods, setMods] = useState<any[]>(modules || []);
  const [f, setF] = useState<any>({
    label: field.label || "", module: field.module || (modules?.[0]?.key) || "PERSONAL", type: field.type || "TEXT",
    visibility: field.visibility || "NECESSARY", scope: field.scope || "GLOBAL", instructorId: field.instructorId || "",
    options: (field.options || []).join(", "), min: field.min ?? "", max: field.max ?? "", pattern: field.pattern || "",
    selfEditable: field.selfEditable !== false,
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  async function onModuleChange(v: string) {
    if (v !== "__new__") { set("module", v); return; }
    const name = await prompt({ title: "New module", message: "Name this section (e.g. Research Output):", placeholder: "Module name", confirmText: "Create", required: true });
    if (!name) return;
    try {
      const r = await api.post("/fields/modules", { label: name });
      setMods((m) => [...m, r.module]);
      set("module", r.module.key);
      reloadModules?.();
      toast.success(`Module "${r.module.label}" created.`);
    } catch (e: any) { toast.error(e.message); }
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      if (isNew) await api.post(`/fields`, f);
      else await api.patch(`/fields/${field.id}`, f);
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? "Define field" : "Edit field"} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        {err && <div className="col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div className="col-span-2"><label className="label">Label</label><input className="input" value={f.label} onChange={(e) => set("label", e.target.value)} /></div>
        <div><label className="label">Module</label><select className="input" value={f.module} onChange={(e) => onModuleChange(e.target.value)}>{mods.map((m: any) => <option key={m.key} value={m.key}>{m.label}</option>)}{isOps && <option value="__new__">＋ New module…</option>}</select></div>
        <div><label className="label">Type</label><select className="input" value={f.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label className="label">Visibility</label><select className="input" value={f.visibility} onChange={(e) => set("visibility", e.target.value)}>{VIS.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
        {isNew && (
          <div><label className="label">Scope</label><select className="input" value={f.scope} onChange={(e) => set("scope", e.target.value)}><option value="GLOBAL">Global (all instructors)</option><option value="INSTANCE">Instance (one instructor)</option></select></div>
        )}
        {isNew && f.scope === "INSTANCE" && (
          <div className="col-span-2"><label className="label">Instructor</label><ScrollSelect value={f.instructorId} placeholder="— select —" onChange={(v) => set("instructorId", v)} options={[{ value: "", label: "— select —" }, ...instructors.map((i: any) => ({ value: i.id, label: `${i.name} (${i.employeeId})` }))]} /></div>
        )}
        {f.type === "DROPDOWN" && <div className="col-span-2"><label className="label">Options (comma-separated)</label><input className="input" value={f.options} onChange={(e) => set("options", e.target.value)} /></div>}
        {f.type === "NUMBER" && <><div><label className="label">Min</label><input className="input" value={f.min} onChange={(e) => set("min", e.target.value)} /></div><div><label className="label">Max</label><input className="input" value={f.max} onChange={(e) => set("max", e.target.value)} /></div></>}
        {f.type === "TEXT" && <div className="col-span-2"><label className="label">Regex pattern (optional)</label><input className="input font-mono text-xs" value={f.pattern} onChange={(e) => set("pattern", e.target.value)} /></div>}
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={f.selfEditable} onChange={(e) => set("selfEditable", e.target.checked)} /> Instructors can edit this on their own “My Stats” page</label>
        <div className="col-span-2 flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
        {!isNew && !isOps && <p className="col-span-2 text-xs text-amber-600">Only the Super Admin can edit definitions; your changes may be rejected.</p>}
      </div>
    </Modal>
  );
}

function ArchiveModal({ field, onClose, onDone }: any) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr(null);
    try { await api.post(`/fields/${field.id}/archive`, { reason }); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Archive "${field.label}"`} onClose={onClose}>
      <p className="text-sm text-slate-600">Archiving hides the field but preserves existing values. A reason is required.</p>
      {err && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
      <textarea className="input mt-3" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this field being archived?" />
      <div className="mt-3 flex justify-end gap-2"><button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button><button disabled={busy} onClick={go} className="btn btn-danger btn-sm disabled:opacity-50">Archive</button></div>
    </Modal>
  );
}
