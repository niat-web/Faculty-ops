import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Copy, ExternalLink, Check, AlertTriangle, RefreshCw, Pencil } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { useConfirm } from "../../confirm";
import { Skeleton } from "../../components/Skeleton";
import { SkeletonRows, SkeletonField } from "../../components/scaffold";
import type { CertSchema } from "../../certForm";

type Cert = { id: string; employeeId: string; createdAt: string; answers: Record<string, string> };

export default function CertificationsSettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [cfg, setCfg] = useState<any>(null);
  const [items, setItems] = useState<Cert[] | null>(null);
  const [schema, setSchema] = useState<CertSchema | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const [s, list] = await Promise.all([api.get("/certifications/settings"), api.get("/certifications")]);
    setCfg(s); setItems(list.items || []); setSchema(list.schema || s.schema || null);
  }
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  async function toggle(patch: any) {
    try { const r = await api.patch("/certifications/settings", patch); setCfg((c: any) => ({ ...c, certForm: r.certForm })); }
    catch (e: any) { toast.error(e.message); }
  }
  async function regenerate() {
    if (!(await confirm({ title: "Regenerate the link?", message: "A new link is created and the current one stops working immediately. Anyone with the old link won't be able to open the form.", confirmText: "Regenerate", danger: true }))) return;
    try { const r = await api.post("/certifications/regenerate"); setCfg((c: any) => ({ ...c, certForm: r.certForm })); toast.success("New link generated."); }
    catch (e: any) { toast.error(e.message); }
  }
  function copy(url: string) { navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }

  const cf = cfg?.certForm || {};
  const formUrl = cf.token ? `${window.location.origin}/certifications/${cf.token}` : "";

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-brand-600" /><h2 className="font-semibold">Certificates public form</h2></div>
          {/* Opens the drag-and-drop form builder — add/edit sections & fields, no developer needed. */}
          <Link to="/app/settings/certifications/builder" className="btn btn-ghost btn-sm border border-brand-200 text-brand-700 hover:bg-brand-50"><Pencil className="h-4 w-4" /> Edit certifications form</Link>
        </div>
        <p className="mb-5 text-sm text-slate-500">Share this link to collect certificate details. Files upload to Google Drive; responses are stored and shown on each instructor's profile.</p>

        {cfg && !cfg.driveReady && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Google Drive isn't configured yet, so uploaded files won't be stored (text responses still save). Set <code>GDRIVE_CERTIFICATES_FOLDER_ID</code> and add the service account to that Shared Drive.</span>
          </div>
        )}

        {/* Public link — a unique UUID link; only people with this exact link can open the form. */}
        <label className="label">Private form link (unique)</label>
        {cfg ? (
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={formUrl} className="input flex-1 min-w-[240px] font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button onClick={() => copy(formUrl)} className="btn btn-ghost btn-sm border border-slate-200">{copied ? <><Check className="h-4 w-4 text-emerald-600" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</button>
            <a href={formUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm border border-slate-200"><ExternalLink className="h-4 w-4" /> Open</a>
            <button onClick={regenerate} className="btn btn-ghost btn-sm border border-slate-200 text-rose-600"><RefreshCw className="h-4 w-4" /> Regenerate</button>
          </div>
        ) : <SkeletonField />}
        <p className="mt-1.5 text-xs text-slate-400">Only someone with this exact link can open the form. Regenerating it revokes the old link.</p>

        {/* Access controls */}
        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
          {cfg ? (
            <>
              <Toggle label="Form is open" desc="Turn off to stop accepting responses." checked={cf.enabled !== false} onChange={(v) => toggle({ enabled: v })} />
              <Toggle label="Require sign-in" desc="On = only signed-in users can submit. Off = anyone with the link." checked={cf.requireLogin === true} onChange={(v) => toggle({ requireLogin: v })} />
            </>
          ) : Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4"><div className="space-y-1.5"><Skeleton width="140px" height="14px" /><Skeleton width="260px" height="10px" /></div><Skeleton width="44px" height="24px" borderRadius="9999px" /></div>
          ))}
        </div>
      </div>

      {/* Submissions table — columns follow the current form schema. */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">{items === null ? "Loading…" : `${items.length} submission(s)`}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {(schema?.fields || []).map((f) => <th key={f.id} className="whitespace-nowrap px-4 py-3">{f.label}</th>)}
                <th className="whitespace-nowrap px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items === null ? <SkeletonRows rows={8} cols={(schema?.fields.length || 6) + 1} cellClass="px-4 py-2.5" /> : <>
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  {(schema?.fields || []).map((f) => {
                    const v = c.answers?.[f.key] || "";
                    return (
                      <td key={f.id} className="max-w-[260px] truncate px-4 py-2.5 text-slate-600" title={f.type === "FILE" ? "" : v}>
                        {f.type === "FILE" ? <CertLink url={v} /> : (v || <span className="text-slate-300">—</span>)}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={(schema?.fields.length || 6) + 1} className="px-5 py-10 text-center text-slate-400">No submissions yet.</td></tr>}
              </>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CertLink({ url }: { url: string }) {
  if (!url) return <span className="text-slate-300">—</span>;
  return <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">View <ExternalLink className="h-3 w-3" /></a>;
}
function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div><div className="text-sm font-medium text-slate-800">{label}</div><div className="text-xs text-slate-500">{desc}</div></div>
      <button onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
