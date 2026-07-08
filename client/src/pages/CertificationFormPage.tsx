import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Search, CheckCircle2, Loader2, Upload, Ban } from "lucide-react";
import { api } from "../api";
import { useDebouncedValue, isAbort } from "../hooks";
import ScrollSelect from "../components/ScrollSelect";

// Public "Certificates" form — replicates the Google Form. Two sections. Employee ID is picked from
// Darwinbox (or "NA"). On submit, files upload to Google Drive and the response is saved to MongoDB.

// Each degree is its own option (not merged into one "Bachelor's Degree (…)" line).
const DEGREE_TYPES = [
  "B.Tech", "B.E.", "B.Sc", "BCA", "B.A", "B.Com", "BBA", "B.Ed",
  "M.Tech", "M.E.", "M.Sc", "MCA", "MBA", "M.A", "M.Com", "PGDM", "M.Ed",
  "Integrated M.Tech", "PhD", "Other",
];
const HAVE = ["Yes — I have it", "No — I have not received it yet"];
// After submitting, remember it in this browser for N days so the same person (same Chrome) sees
// "already submitted" instead of the form — avoids duplicates without requiring a login.
const REMEMBER_DAYS = 10;
const submitKey = (token: string) => `cert_submitted_${token}`;
type Emp = { employeeId: string; name: string; email: string; department: string };
type Form = {
  employeeId: string; fullName: string; email: string; department: string; capabilityManagerName: string;
  degreeType: string; highestQualification: string; domain: string; yearOfPassing: string;
  odHave: string; odExpected: string; cmmHave: string; cmmExpected: string; pcHave: string; pcExpected: string; remarks: string;
};
const EMPTY: Form = { employeeId: "", fullName: "", email: "", department: "", capabilityManagerName: "", degreeType: "", highestQualification: "", domain: "", yearOfPassing: "", odHave: "", odExpected: "", cmmHave: "", cmmExpected: "", pcHave: "", pcExpected: "", remarks: "" };

export default function CertificationFormPage() {
  const { token = "" } = useParams();
  const tq = `token=${encodeURIComponent(token)}`;
  const [cfg, setCfg] = useState<any>(null);
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [done, setDone] = useState<null | string>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const odRef = useRef<HTMLInputElement>(null), cmmRef = useRef<HTMLInputElement>(null), pcRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.get(`/certifications/config?${tq}`).then(setCfg).catch((e) => setCfgErr(e.message)); }, [tq]);
  // Already submitted from this browser in the last N days?
  useEffect(() => {
    if (!token) return;
    const ts = Number(localStorage.getItem(submitKey(token)) || 0);
    if (ts && Date.now() - ts < REMEMBER_DAYS * 86400000) setAlready(true);
  }, [token]);
  const set = (k: keyof Form, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.fullName.trim()) { setErr("Please enter your full name."); return; }
    // Images only (defense-in-depth; the server also enforces this).
    for (const r of [odRef, cmmRef, pcRef]) {
      const file = r.current?.files?.[0];
      if (file && !file.type.startsWith("image/")) { setErr("Only image files are allowed — no PDF, DOCX or other formats."); return; }
    }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      if (odRef.current?.files?.[0]) fd.append("od", odRef.current.files[0]);
      if (cmmRef.current?.files?.[0]) fd.append("cmm", cmmRef.current.files[0]);
      if (pcRef.current?.files?.[0]) fd.append("pc", pcRef.current.files[0]);
      const r = await api.upload(`/certifications/submit?${tq}`, fd);
      try { localStorage.setItem(submitKey(token), String(Date.now())); } catch { /* ignore */ }
      setDone(r.warning || "Your certificate details have been submitted. Thank you!");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  // Short status screens are centered on the page.
  if (cfgErr) return <CenterCard><p className="text-sm text-rose-600">{cfgErr}</p></CenterCard>;
  if (!cfg) return <CenterCard><div className="flex items-center justify-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></CenterCard>;
  if (!cfg.valid) return <CenterCard><Ban className="mx-auto mb-3 h-10 w-10 text-slate-300" /><h2 className="text-lg font-semibold">Invalid link</h2><p className="mt-1 text-sm text-slate-500">This form link is invalid or has been reset. Please ask your admin for the current link.</p></CenterCard>;
  if (already && !done) return <CenterCard><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" /><h2 className="text-lg font-semibold">Already submitted</h2><p className="mt-1 text-sm text-slate-600">You've already submitted this form from this browser. Thank you!</p></CenterCard>;
  if (!cfg.enabled) return <CenterCard><h2 className="text-lg font-semibold">Form closed</h2><p className="mt-1 text-sm text-slate-500">This form isn't accepting responses right now.</p></CenterCard>;
  if (done) return <CenterCard><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" /><h2 className="text-lg font-semibold">Submitted</h2><p className="mt-1 text-sm text-slate-600">{done}</p></CenterCard>;

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-5">
        {err && <div className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{err}</div>}

        {/* Section 1 */}
        <section className="card p-6">
          <SectionHead n={1} title="Your Details" />
          <div className="space-y-4">
            <EmployeePicker tq={tq} value={f.employeeId} name={f.fullName} onPick={(e) => setF((p) => ({ ...p, employeeId: e.employeeId, fullName: e.name || p.fullName, email: e.email || p.email, department: e.department || p.department }))} onNA={() => set("employeeId", "NA")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name" required><input className="input" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
              <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="Department"><input className="input" value={f.department} onChange={(e) => set("department", e.target.value)} /></Field>
              <Field label="Capability Manager Name"><input className="input" value={f.capabilityManagerName} onChange={(e) => set("capabilityManagerName", e.target.value)} /></Field>
              <Field label="Current Highest Degree Type"><ScrollSelect value={f.degreeType} onChange={(v) => setF((p) => ({ ...p, degreeType: v, highestQualification: v === "Other" ? "" : v }))} options={DEGREE_TYPES.map((d) => ({ value: d, label: d }))} placeholder="— select —" /></Field>
              {/* Free-text qualification only when "Other" is chosen (otherwise the degree IS the qualification). */}
              {f.degreeType === "Other" && <Field label="Highest Qualification" required><input autoFocus className="input" placeholder="Type your qualification (e.g. Diploma)" value={f.highestQualification} onChange={(e) => set("highestQualification", e.target.value)} /></Field>}
              <Field label="Domain / Specialization"><input className="input" value={f.domain} onChange={(e) => set("domain", e.target.value)} /></Field>
              <Field label="Year of Passing"><input className="input" value={f.yearOfPassing} onChange={(e) => set("yearOfPassing", e.target.value)} /></Field>
            </div>
          </div>
        </section>

        {/* Section 2 */}
        <section className="card p-6">
          <SectionHead n={2} title="Certificates" />
          <div className="space-y-5">
            <CertBlock label="Original Degree (OD) Certificate" have={f.odHave} expected={f.odExpected} onHave={(v) => set("odHave", v)} onExpected={(v) => set("odExpected", v)} fileRef={odRef} />
            <CertBlock label="Consolidated Marksheet (CMM)" have={f.cmmHave} expected={f.cmmExpected} onHave={(v) => set("cmmHave", v)} onExpected={(v) => set("cmmExpected", v)} fileRef={cmmRef} />
            <CertBlock label="Provisional Certificate (PC)" have={f.pcHave} expected={f.pcExpected} onHave={(v) => set("pcHave", v)} onExpected={(v) => set("pcExpected", v)} fileRef={pcRef} />
            <Field label="Remarks / Additional Comments"><textarea className="input min-h-[80px]" value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
          </div>
        </section>

        <div className="flex justify-end pb-10">
          <button disabled={busy} className="btn btn-primary disabled:opacity-50">{busy ? "Submitting…" : "Submit"}</button>
        </div>
      </form>
    </Shell>
  );
}

// Form layout — centered column, no logo.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-6">{children}</div>
    </div>
  );
}
// Centered card for short status screens (invalid link, closed, submitted, …).
function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-md p-8 text-center">{children}</div>
    </div>
  );
}
function SectionHead({ n, title }: { n: number; title: string }) {
  return <div className="mb-4 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{n}</span><h2 className="font-semibold text-slate-800">{title}</h2></div>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="label">{label}{required && <span className="text-rose-500"> *</span>}</label>{children}</div>;
}

function CertBlock({ label, have, expected, onHave, onExpected, fileRef }: { label: string; have: string; expected: string; onHave: (v: string) => void; onExpected: (v: string) => void; fileRef: React.RefObject<HTMLInputElement> }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 text-sm font-medium text-slate-800">{label}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Do you have it?"><select className="input" value={have} onChange={(e) => onHave(e.target.value)}><option value="">— select —</option>{HAVE.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
        <Field label="Expected Month & Year (if not)"><input className="input" placeholder="e.g. Aug 2026 / NA" value={expected} onChange={(e) => onExpected(e.target.value)} /></Field>
      </div>
      <div className="mt-3">
        <label className="label flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Upload image (JPG / PNG only)</label>
        <input ref={fileRef} type="file" accept="image/*" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
      </div>
    </div>
  );
}

function EmployeePicker({ tq, value, name, onPick, onNA }: { tq: string; value: string; name: string; onPick: (e: Emp) => void; onNA: () => void }) {
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
    <Field label="Employee ID" required>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span><b className="font-mono">{value}</b>{value !== "NA" && name ? <span className="text-slate-500"> · {name}</span> : value === "NA" ? <span className="text-slate-500"> · Not in the list</span> : ""}</span>
          <button type="button" onClick={() => { onPick({ employeeId: "", name: "", email: "", department: "" }); setQ(""); }} className="text-xs font-medium text-brand-600 hover:underline">Change</button>
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
    </Field>
  );
}

