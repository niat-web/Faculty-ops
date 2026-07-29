import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Search, Loader2, Upload, ExternalLink } from "lucide-react";
import { api } from "../api";
import { useDebouncedValue, isAbort } from "../hooks";
import { useToast } from "../toast";
import ScrollSelect from "../components/ScrollSelect";
import type { CertSchema, CertField } from "../certForm";

type Emp = { employeeId: string; name: string; email: string; department: string };

export default function CertificationAdminFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = !!id;
  const [schema, setSchema] = useState<CertSchema | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    if (isEdit) {
      api.get(`/certifications/${id}`, { signal: ac.signal })
        .then((r) => { setSchema(r.schema || null); setValues(r.item?.answers || {}); })
        .catch((e) => { if (!isAbort(e)) setErr(e.message); })
        .finally(() => setLoading(false));
    } else {
      api.get("/certifications", { signal: ac.signal })
        .then((r) => setSchema(r.schema || null))
        .catch((e) => { if (!isAbort(e)) setErr(e.message); })
        .finally(() => setLoading(false));
    }
    return () => ac.abort();
  }, [id, isEdit]);

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!schema) return;
    for (const f of schema.fields) {
      if (f.required && f.type !== "FILE" && !String(values[f.key] || "").trim()) { setErr(`Please fill in "${f.label}".`); return; }
      if (f.required && f.type === "FILE" && !fileRefs.current[f.key]?.files?.[0] && !values[f.key]) { setErr(`Please attach "${f.label}".`); return; }
    }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      for (const f of schema.fields) {
        if (f.type === "FILE") { const file = fileRefs.current[f.key]?.files?.[0]; if (file) fd.append(f.key, file); }
        else fd.append(f.key, values[f.key] || "");
      }
      const r = isEdit
        ? await api.uploadPatch(`/certifications/${id}`, fd)
        : await api.upload("/certifications/admin", fd);
      if (r.warning) toast.info(r.warning);
      toast.success(isEdit ? "Certification updated." : "Certification added.");
      navigate("/app/certifications");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  if (err && !schema) return <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{err}</div>;
  if (!schema?.fields.length) return <div className="text-sm text-slate-500">This form has no fields yet. Configure it in Settings → Operations.</div>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/app/certifications" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to Certifications
        </Link>
        <h1 className="text-2xl font-bold">{isEdit ? "Edit certification" : "Add certification"}</h1>
        <p className="text-sm text-slate-500">{isEdit ? "Update this submission and save." : "Create a new certification submission on behalf of an employee."}</p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {err && <div className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{err}</div>}
        {schema.sections.map((sec, si) => {
          const fields = schema.fields.filter((f) => f.sectionId === sec.id);
          if (!fields.length) return null;
          return (
            <section key={sec.id} className="card p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{si + 1}</span>
                <h2 className="font-semibold text-slate-800">{sec.title}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {fields.map((f) => (
                  <div key={f.id} className={f.type === "TEXTAREA" || f.type === "EMPLOYEE" || f.type === "CHECKBOX" || f.type === "RADIO" ? "md:col-span-3" : ""}>
                    <FieldInput
                      field={f}
                      value={values[f.key] || ""}
                      onChange={(v) => set(f.key, v)}
                      fileRef={(el) => (fileRefs.current[f.key] = el)}
                      onEmployee={(e) => setValues((p) => ({
                        ...p,
                        employeeId: e.employeeId,
                        ...(e.name ? { fullName: p.fullName || e.name } : {}),
                        ...(e.email ? { email: p.email || e.email } : {}),
                        ...(e.department ? { department: p.department || e.department } : {}),
                      }))}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <div className="flex justify-end gap-2 pb-6">
          <Link to="/app/certifications" className="btn btn-ghost">Cancel</Link>
          <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-50">{busy ? "Saving…" : isEdit ? "Update" : "Submit"}</button>
        </div>
      </form>
    </div>
  );
}

function Label({ f }: { f: CertField }) {
  return <label className="label">{f.label}{f.required && <span className="text-rose-500"> *</span>}</label>;
}

function FieldInput({ field: f, value, onChange, fileRef, onEmployee }: {
  field: CertField; value: string; onChange: (v: string) => void;
  fileRef: (el: HTMLInputElement | null) => void; onEmployee: (e: Emp) => void;
}) {
  if (f.type === "EMPLOYEE") return <AdminEmployeePicker f={f} value={value} onPick={(e) => { onChange(e.employeeId); onEmployee(e); }} onNA={() => onChange("NA")} onClear={() => onChange("")} />;

  if (f.type === "FILE") return (
    <div>
      <label className="label flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> {f.label}{f.required && <span className="text-rose-500">*</span>}</label>
      {value && (
        <a href={value} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
          Current file <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <input ref={fileRef} type="file" accept={f.accept || "image/*,application/pdf"} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
      {f.help && <p className="mt-1 text-xs text-slate-400">{f.help}</p>}
    </div>
  );

  if (f.type === "TEXTAREA") return <div><Label f={f} /><textarea className="input min-h-[80px]" placeholder={f.placeholder} value={value} onChange={(e) => onChange(e.target.value)} />{f.help && <p className="mt-1 text-xs text-slate-400">{f.help}</p>}</div>;
  if (f.type === "DROPDOWN") return <div><Label f={f} /><ScrollSelect value={value} onChange={onChange} placeholder="— select —" options={(f.options || []).map((o) => ({ value: o, label: o }))} />{f.help && <p className="mt-1 text-xs text-slate-400">{f.help}</p>}</div>;

  if (f.type === "RADIO") return (
    <div><Label f={f} />
      <div className="mt-1 flex flex-wrap gap-2">
        {(f.options || []).map((o) => (
          <label key={o} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition ${value === o ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <input type="radio" className="hidden" name={f.key} checked={value === o} onChange={() => onChange(o)} /> {o}
          </label>
        ))}
      </div>{f.help && <p className="mt-1 text-xs text-slate-400">{f.help}</p>}
    </div>
  );

  if (f.type === "CHECKBOX") {
    const set = new Set(value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);
    const toggle = (o: string) => { const n = new Set(set); n.has(o) ? n.delete(o) : n.add(o); onChange([...n].join(", ")); };
    return (
      <div><Label f={f} />
        <div className="mt-1 flex flex-wrap gap-2">
          {(f.options || []).map((o) => (
            <label key={o} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${set.has(o) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <input type="checkbox" className="h-4 w-4" checked={set.has(o)} onChange={() => toggle(o)} /> {o}
            </label>
          ))}
        </div>{f.help && <p className="mt-1 text-xs text-slate-400">{f.help}</p>}
      </div>
    );
  }

  const inputType = f.type === "EMAIL" ? "email" : f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text";
  return <div><Label f={f} /><input className="input" type={inputType} placeholder={f.placeholder} value={value} onChange={(e) => onChange(e.target.value)} />{f.help && <p className="mt-1 text-xs text-slate-400">{f.help}</p>}</div>;
}

function AdminEmployeePicker({ f, value, onPick, onNA, onClear }: { f: CertField; value: string; onPick: (e: Emp) => void; onNA: () => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [results, setResults] = useState<Emp[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!dq.trim()) { setResults([]); return; }
    const ac = new AbortController();
    setSearching(true);
    api.get(`/certifications/admin/employee-search?q=${encodeURIComponent(dq)}`, { signal: ac.signal })
      .then((r) => { setResults(r.items || []); setOpen(true); })
      .catch((e) => { if (!isAbort(e)) setResults([]); })
      .finally(() => setSearching(false));
    return () => ac.abort();
  }, [dq]);

  return (
    <div>
      <Label f={f} />
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span><b className="font-mono">{value}</b>{value === "NA" ? <span className="text-slate-500"> · Not in the list</span> : ""}</span>
          <button type="button" onClick={() => { onClear(); setQ(""); }} className="text-xs font-medium text-brand-600 hover:underline">Change</button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
          <input className="input pl-9" placeholder="Search Employee ID or name…" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} />
          {open && (results.length > 0 || dq.trim()) && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {results.map((p) => (
                <button type="button" key={p.employeeId} onClick={() => { onPick(p); setOpen(false); }} className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-slate-50">
                  <span className="text-sm font-medium text-slate-800">{p.name} <span className="font-mono text-[11px] text-slate-400">{p.employeeId}</span></span>
                  <span className="truncate text-xs text-slate-500">{p.department || p.email}</span>
                </button>
              ))}
              <button type="button" onClick={() => { onNA(); setOpen(false); }} className="block w-full border-t border-slate-100 px-4 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
                ID not listed — use <b>NA</b>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
