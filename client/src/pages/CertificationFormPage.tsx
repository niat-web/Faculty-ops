import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Search, CheckCircle2, Loader2, Upload, Ban } from "lucide-react";
import { api } from "../api";
import { useDebouncedValue, isAbort } from "../hooks";
import ScrollSelect from "../components/ScrollSelect";
import type { CertSchema, CertField } from "../certForm";

// Public "Certificates" form — rendered ENTIRELY from the admin-configured schema (sections + fields).
// Text answers submit as form fields keyed by field key; FILE fields upload to Google Drive.

const REMEMBER_DAYS = 10;
const submitKey = (token: string) => `cert_submitted_${token}`;
type Emp = { employeeId: string; name: string; email: string; department: string };

export default function CertificationFormPage() {
  const { token = "" } = useParams();
  const tq = `token=${encodeURIComponent(token)}`;
  const [cfg, setCfg] = useState<any>(null);
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [done, setDone] = useState<null | string>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [already, setAlready] = useState(false);

  useEffect(() => { api.get(`/certifications/config?${tq}`).then(setCfg).catch((e) => setCfgErr(e.message)); }, [tq]);
  useEffect(() => {
    if (!token) return;
    const ts = Number(localStorage.getItem(submitKey(token)) || 0);
    if (ts && Date.now() - ts < REMEMBER_DAYS * 86400000) setAlready(true);
  }, [token]);

  const schema: CertSchema | null = cfg?.schema || null;
  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!schema) return;
    // Required-field validation (non-file). File "required" is best-effort — checked below.
    for (const f of schema.fields) {
      if (f.required && f.type !== "FILE" && !String(values[f.key] || "").trim()) { setErr(`Please fill in "${f.label}".`); return; }
      if (f.required && f.type === "FILE" && !fileRefs.current[f.key]?.files?.[0]) { setErr(`Please attach "${f.label}".`); return; }
    }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      for (const f of schema.fields) {
        if (f.type === "FILE") { const file = fileRefs.current[f.key]?.files?.[0]; if (file) fd.append(f.key, file); }
        else fd.append(f.key, values[f.key] || "");
      }
      const r = await api.upload(`/certifications/submit?${tq}`, fd);
      try { localStorage.setItem(submitKey(token), String(Date.now())); } catch { /* ignore */ }
      setDone(r.warning || "Your certificate details have been submitted. Thank you!");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (cfgErr) return <CenterCard><p className="text-sm text-rose-600">{cfgErr}</p></CenterCard>;
  if (!cfg) return <CenterCard><div className="flex items-center justify-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></CenterCard>;
  if (!cfg.valid) return <CenterCard><Ban className="mx-auto mb-3 h-10 w-10 text-slate-300" /><h2 className="text-lg font-semibold">Invalid link</h2><p className="mt-1 text-sm text-slate-500">This form link is invalid or has been reset. Please ask your admin for the current link.</p></CenterCard>;
  if (already && !done) return <CenterCard><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" /><h2 className="text-lg font-semibold">Already submitted</h2><p className="mt-1 text-sm text-slate-600">You've already submitted this form from this browser. Thank you!</p></CenterCard>;
  if (!cfg.enabled) return <CenterCard><h2 className="text-lg font-semibold">Form closed</h2><p className="mt-1 text-sm text-slate-500">This form isn't accepting responses right now.</p></CenterCard>;
  if (done) return <CenterCard><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" /><h2 className="text-lg font-semibold">Submitted</h2><p className="mt-1 text-sm text-slate-600">{done}</p></CenterCard>;
  if (!schema || !schema.fields.length) return <CenterCard><h2 className="text-lg font-semibold">Form not ready</h2><p className="mt-1 text-sm text-slate-500">This form has no fields yet. Please ask your admin.</p></CenterCard>;

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-5">
        {err && <div className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{err}</div>}
        {schema.sections.map((sec, si) => {
          const fields = schema.fields.filter((f) => f.sectionId === sec.id);
          if (!fields.length) return null;
          return (
            <section key={sec.id} className="card p-6">
              <div className="mb-4 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{si + 1}</span><h2 className="font-semibold text-slate-800">{sec.title}</h2></div>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.id} className={f.type === "TEXTAREA" || f.type === "EMPLOYEE" || f.type === "CHECKBOX" || f.type === "RADIO" ? "sm:col-span-2" : ""}>
                    <FieldInput
                      field={f}
                      value={values[f.key] || ""}
                      onChange={(v) => set(f.key, v)}
                      fileRef={(el) => (fileRefs.current[f.key] = el)}
                      tq={tq}
                      onEmployee={(e) => setValues((p) => ({ ...p, employeeId: e.employeeId, ...(e.name ? { fullName: p.fullName || e.name } : {}), ...(e.email ? { email: p.email || e.email } : {}), ...(e.department ? { department: p.department || e.department } : {}) }))}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <div className="flex justify-end pb-10">
          <button disabled={busy} className="btn btn-primary disabled:opacity-50">{busy ? "Submitting…" : "Submit"}</button>
        </div>
      </form>
    </Shell>
  );
}

function Label({ f }: { f: CertField }) {
  return <label className="label">{f.label}{f.required && <span className="text-rose-500"> *</span>}</label>;
}

function FieldInput({ field: f, value, onChange, fileRef, tq, onEmployee }: {
  field: CertField; value: string; onChange: (v: string) => void; fileRef: (el: HTMLInputElement | null) => void; tq: string; onEmployee: (e: Emp) => void;
}) {
  if (f.type === "EMPLOYEE") return <EmployeePicker f={f} tq={tq} value={value} onPick={(e) => { onChange(e.employeeId); onEmployee(e); }} onNA={() => onChange("NA")} onClear={() => onChange("")} />;

  if (f.type === "FILE") return (
    <div>
      <label className="label flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> {f.label}{f.required && <span className="text-rose-500">*</span>}</label>
      <input ref={fileRef} type="file" accept={f.accept || "image/*"} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
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

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-2xl px-4 py-6">{children}</div></div>;
}
function CenterCard({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="card w-full max-w-md p-8 text-center">{children}</div></div>;
}

function EmployeePicker({ f, tq, value, onPick, onNA, onClear }: { f: CertField; tq: string; value: string; onPick: (e: Emp) => void; onNA: () => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [results, setResults] = useState<Emp[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!dq.trim()) { setResults([]); return; }
    const ac = new AbortController();
    setSearching(true);
    api.get(`/certifications/employee-search?q=${encodeURIComponent(dq)}&${tq}`, { signal: ac.signal })
      .then((r) => { setResults(r.items || []); setOpen(true); })
      .catch((e) => { if (!isAbort(e)) setResults([]); })
      .finally(() => setSearching(false));
    return () => ac.abort();
  }, [dq, tq]);

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
          <input className="input pl-9" placeholder="Type your Employee ID or name…" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} />
          {open && (results.length > 0 || dq.trim()) && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {results.map((p) => (
                <button type="button" key={p.employeeId} onClick={() => { onPick(p); setOpen(false); }} className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-slate-50">
                  <span className="text-sm font-medium text-slate-800">{p.name} <span className="font-mono text-[11px] text-slate-400">{p.employeeId}</span></span>
                  <span className="truncate text-xs text-slate-500">{p.department || p.email}</span>
                </button>
              ))}
              <button type="button" onClick={() => { onNA(); setOpen(false); }} className="block w-full border-t border-slate-100 px-4 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
                My ID isn't listed — use <b>NA</b>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
