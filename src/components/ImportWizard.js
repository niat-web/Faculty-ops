"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";

const ACTION_CHIP = { create: "chip-public", update: "chip-status", error: "chip-sensitive" };

export default function ImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function runPreview(selected) {
    setErr(null); setResult(null); setPreview(null); setBusy(true);
    const fd = new FormData(); fd.set("file", selected);
    const res = await fetch("/api/instructors/import?mode=preview", { method: "POST", body: fd });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) setPreview(j); else setErr(j.error || "Could not read file");
  }

  function onPick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    runPreview(f);
  }

  async function commit() {
    if (!file) return;
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.set("file", file);
    const res = await fetch("/api/instructors/import?mode=commit", { method: "POST", body: fd });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setResult(j); router.refresh(); } else setErr(j.error || "Import failed");
  }

  function reset() { setFile(null); setPreview(null); setResult(null); setErr(null); }

  return (
    <div className="space-y-5">
      {/* Step 1 — template + upload */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <div className="mb-3 inline-flex rounded-lg bg-brand-50 p-3 text-brand-600"><FileSpreadsheet className="h-6 w-6" /></div>
          <h3 className="font-semibold">1 · Get the template</h3>
          <p className="mt-1 text-sm text-slate-500">Columns match your current fields. Fill it with your spreadsheet data.</p>
          <a href="/api/instructors/import/template" className="btn btn-ghost btn-sm mt-4"><Download className="h-4 w-4" /> Download CSV template</a>
        </div>
        <div className="card p-6">
          <div className="mb-3 inline-flex rounded-lg bg-brand-50 p-3 text-brand-600"><UploadCloud className="h-6 w-6" /></div>
          <h3 className="font-semibold">2 · Upload your CSV</h3>
          <p className="mt-1 text-sm text-slate-500">We validate every row before anything is written.</p>
          <label className="btn btn-primary btn-sm mt-4 cursor-pointer">
            <UploadCloud className="h-4 w-4" /> Choose file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onPick} />
          </label>
          {file && <p className="mt-2 text-xs text-slate-500">{file.name}</p>}
        </div>
      </div>

      {busy && !result && (
        <div className="card flex items-center gap-3 p-6 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> Validating…
        </div>
      )}
      {err && <div className="card border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>}

      {/* Step 3 — preview / reconciliation */}
      {preview && !result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total rows" value={preview.summary.total} tone="slate" />
            <Stat label="Will create" value={preview.summary.create} tone="emerald" icon={CheckCircle2} />
            <Stat label="Will update" value={preview.summary.update} tone="brand" />
            <Stat label="Errors" value={preview.summary.error} tone="rose" icon={XCircle} />
          </div>

          {preview.unknownColumns?.length > 0 && (
            <div className="card flex items-start gap-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>These columns don&apos;t match any field and will be ignored: <strong>{preview.unknownColumns.join(", ")}</strong>. Add them under Dynamic Fields first if you need them.</span>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">Row-by-row preview</div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="px-5 py-3">Row</th><th className="px-5 py-3">Employee ID</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Notes</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((r) => (
                    <tr key={r.rowNum} className={r.action === "error" ? "bg-rose-50/40" : ""}>
                      <td className="px-5 py-2.5 text-xs text-slate-400">{r.rowNum}</td>
                      <td className="px-5 py-2.5 font-mono text-xs">{r.employeeId || "—"}</td>
                      <td className="px-5 py-2.5">{r.name || "—"}</td>
                      <td className="px-5 py-2.5"><span className={`chip ${ACTION_CHIP[r.action]}`}>{r.action}</span></td>
                      <td className="px-5 py-2.5 text-xs">
                        {r.errors.map((e, i) => <div key={i} className="text-rose-600">• {e}</div>)}
                        {r.warnings.map((w, i) => <div key={i} className="text-amber-600">• {w}</div>)}
                        {!r.errors.length && !r.warnings.length && <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {preview.summary.error > 0
                ? `${preview.summary.error} row(s) with errors will be skipped.`
                : "All rows look good."}
            </p>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={reset}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={busy || preview.summary.create + preview.summary.update === 0} onClick={commit}>
                {busy ? "Importing…" : `Import ${preview.summary.create + preview.summary.update} record(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-5 w-5" /><h3 className="font-semibold">Import complete</h3></div>
          <p className="mt-2 text-sm text-emerald-800">Created {result.created} · Updated {result.updated} · Skipped {result.skipped}</p>
          <div className="mt-4 flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={reset}>Import another file</button>
            <a href="/app/instructors" className="btn btn-primary btn-sm">View instructors</a>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, icon: Icon }) {
  const tones = {
    slate: "text-slate-600 bg-slate-100", emerald: "text-emerald-600 bg-emerald-50",
    brand: "text-brand-600 bg-brand-50", rose: "text-rose-600 bg-rose-50",
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      {Icon && <div className={`rounded-lg p-2 ${tones[tone]}`}><Icon className="h-5 w-5" /></div>}
      <div><div className="text-xl font-bold">{value}</div><div className="text-xs text-slate-500">{label}</div></div>
    </div>
  );
}
