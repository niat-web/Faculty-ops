import { useEffect, useState } from "react";
import { Building, Check } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { Skeleton } from "../../components/Skeleton";

// Ops-only: which departments (sourced from Darwinbox → the Mongo master mirror) are SHOWN by default in
// the Instructor Master's "Departments" quick-filter. Unticking a department here makes it unchecked when
// the Master page opens (it can still be turned on there). Saved to Settings → masterDepartments.hidden.
type Dept = { name: string; hidden: boolean };

export default function MasterDepartmentsSettingsPage() {
  const toast = useToast();
  const [depts, setDepts] = useState<Dept[]>([]);
  // `show` maps department name → shown-by-default (the inverse of `hidden`). This is the editable state.
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get("/settings/master-departments");
    const list: Dept[] = r.departments || [];
    setDepts(list);
    setShow(Object.fromEntries(list.map((d) => [d.name, !d.hidden])));
    setLoaded(true);
  }
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  const shownCount = depts.filter((d) => show[d.name]).length;
  const toggle = (name: string) => setShow((s) => ({ ...s, [name]: !s[name] }));
  const setAll = (on: boolean) => setShow(Object.fromEntries(depts.map((d) => [d.name, on])));

  async function save() {
    setBusy(true);
    try {
      const hidden = depts.filter((d) => !show[d.name]).map((d) => d.name);
      await api.patch("/settings/master-departments", { hidden });
      toast.success("Default departments saved.");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2"><Building className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Instructor Master departments</h2></div>
      <p className="mb-5 text-sm text-slate-500">
        Choose which departments (synced from Darwinbox) are <b>ticked by default</b> in the Instructor Master's
        <span className="whitespace-nowrap"> "Departments"</span> menu when the page opens. Unticked departments are hidden by default —
        anyone can still turn them on from the Master. This affects everyone.
      </p>

      {!loaded ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height="40px" borderRadius="8px" />)}</div>
      ) : !depts.length ? (
        <p className="text-sm text-slate-400">No departments found yet — they appear here once Darwinbox has synced.</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500"><b className="text-slate-800">{shownCount}</b> of {depts.length} shown by default</span>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => setAll(true)} className="font-medium text-brand-600 hover:underline">Show all</button>
              <span className="text-slate-300">·</span>
              <button onClick={() => setAll(false)} className="font-medium text-slate-500 hover:underline">Hide all</button>
            </div>
          </div>

          <div className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {depts.map((d) => {
              const on = !!show[d.name];
              return (
                <label key={d.name} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white"}`}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(d.name)} />
                  <span className={on ? "text-slate-700" : "text-slate-400"}>{d.name}</span>
                  {!on && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Hidden by default</span>}
                </label>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </>
      )}
    </div>
  );
}
