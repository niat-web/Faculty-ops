import { useEffect, useRef, useState } from "react";
import { Database, Cloud, Building2, Search, RefreshCw, AlertTriangle, ArrowRightLeft, CheckCircle2, ChevronDown } from "lucide-react";
import { api } from "../api";
import { useDebouncedValue, isAbort } from "../hooks";
import { useConfirm } from "../confirm";
import { useToast } from "../toast";
import Loading from "../components/Loading";
import { TableSkeleton } from "../components/Skeleton";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";

type SourceKey = "bigquery" | "darwinbox";

type TablePage = {
  ok: boolean;
  columns: string[];
  rows: Record<string, any>[];
  total: number;
  fetchedAt: string;
  source: string;
  error?: string;
};

const SOURCES: { key: SourceKey; title: string; desc: string; icon: any }[] = [
  { key: "bigquery", title: "BigQuery", desc: "Instructor training progress table (Google BigQuery)", icon: Cloud },
  { key: "darwinbox", title: "Darwinbox", desc: "Employee master data (Darwinbox HRMS)", icon: Building2 },
];

// Prettify snake_case column names for the header row.
const colLabel = (c: string) => c.replace(/[_.]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default function DataPage() {
  const [source, setSource] = useState<SourceKey | null>(null);
  const [sources, setSources] = useState<any>(null);
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 400);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [data, setData] = useState<TablePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0); // bump to re-fetch
  const forceRefresh = useRef(false); // set by the Refresh button, consumed by the next fetch only
  const [syncOpen, setSyncOpen] = useState(false); // Darwinbox → Instructor Master sync modal

  useEffect(() => { api.get("/data/sources").then(setSources).catch(() => {}); }, []);

  // Back to page 1 whenever the source or search changes.
  useEffect(() => { setPage(1); }, [source, dq]);

  useEffect(() => {
    if (!source) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: String(per), offset: String((page - 1) * per) });
    if (dq.trim()) params.set("q", dq.trim());
    if (source === "darwinbox" && forceRefresh.current) { params.set("refresh", "1"); forceRefresh.current = false; }
    api.get<TablePage>(`/data/${source}?${params}`, { signal: ctrl.signal })
      .then((r) => setData(r))
      .catch((e) => { if (!isAbort(e)) { setData(null); setError(e.message || "Failed to load data."); } })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [source, dq, page, per, refreshTick]);

  const pages = Math.max(1, Math.ceil((data?.total || 0) / per));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Database className="h-6 w-6 text-brand-600" /> Data</h1>
        <p className="text-sm text-slate-500">Browse raw records from connected data sources.</p>
      </div>

      {/* Source picker — the page starts empty until one is chosen. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {SOURCES.map((s) => {
          const info = sources?.[s.key];
          const active = source === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSource(s.key)}
              className={`card flex items-start gap-3 p-4 text-left transition hover:border-brand-300 hover:shadow-md ${active ? "border-brand-500 ring-2 ring-brand-100" : ""}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-600"}`}>
                <s.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {s.title}
                  {info && !info.configured && <span className="chip bg-amber-50 text-amber-700">Not configured</span>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{s.desc}</span>
                {info?.label && <span className="mt-1 block truncate text-[11px] text-slate-400" title={info.label}>{info.label}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {!source && (
        <div className="card p-10 text-center text-sm text-slate-400">Select a data source above to view its records.</div>
      )}

      {source && (
        <>
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div className="relative min-w-[240px] flex-1">
              <label className="label">Search</label>
              <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
              <input className="input pl-9" placeholder="Search records…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="text-sm text-slate-500">
              <div className="label">Records</div>
              {data ? `${data.total} record(s)` : "—"}
            </div>
            {data?.fetchedAt && (
              <div className="text-sm text-slate-500">
                <div className="label">Fetched</div>
                {new Date(data.fetchedAt).toLocaleString()}
              </div>
            )}
            <button
              onClick={() => { forceRefresh.current = true; setRefreshTick((t) => t + 1); }}
              disabled={loading}
              className="btn btn-ghost btn-sm disabled:opacity-40"
              title={source === "darwinbox" ? "Pull fresh data from Darwinbox" : "Re-run the query"}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {source === "darwinbox" && (
              <button onClick={() => setSyncOpen(true)} className="btn btn-primary btn-sm" title="Preview & apply Darwinbox → Instructor Master sync (instructor departments only)">
                <ArrowRightLeft className="h-4 w-4" /> Sync to Instructor Master
              </button>
            )}
          </div>

          {loading && !data && <TableSkeleton rows={10} cols={6} />}

          {error && (
            <div className="card p-6">
              <div className="mb-1 flex items-center gap-2 text-rose-600"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Couldn't load {source === "bigquery" ? "BigQuery" : "Darwinbox"} data</h2></div>
              <p className="text-sm text-slate-600">{error}</p>
              <button onClick={() => setRefreshTick((t) => t + 1)} className="btn btn-primary btn-sm mt-4">Retry</button>
            </div>
          )}

          {data && !error && (
            <>
              <div className={`card overflow-hidden ${loading ? "opacity-60" : ""}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        {data.columns.map((c) => <th key={c} className="whitespace-nowrap px-4 py-3">{colLabel(c)}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-xs text-slate-400">{(page - 1) * per + i + 1}</td>
                          {data.columns.map((c) => {
                            const v = String(r[c] ?? "");
                            return (
                              <td key={c} className="max-w-[280px] truncate whitespace-nowrap px-4 py-2.5 text-slate-700" title={v}>
                                {v || <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {!data.rows.length && (
                        <tr><td colSpan={data.columns.length + 1} className="px-4 py-10 text-center text-slate-400">No records found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pagination page={page} pages={pages} per={per} total={data.total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />
            </>
          )}
        </>
      )}

      {syncOpen && <DarwinboxSyncModal onClose={() => setSyncOpen(false)} onApplied={() => setRefreshTick((t) => t + 1)} />}
    </div>
  );
}

// ---- Darwinbox → Instructor Master sync -------------------------------------------------------
// Preview (dry run) first, then apply. Only instructor-department employees are in scope;
// Darwinbox wins on synced fields; FacultyOps-managed fields are never touched.

function Section({ title, count, tone, children }: { title: string; count: number; tone?: string; children: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50" disabled={!count}>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="flex-1">{title}</span>
        <span className={`chip ${tone || "chip-status"}`}>{count}</span>
      </button>
      {open && !!count && <div className="max-h-64 overflow-y-auto border-t border-slate-100 px-3 py-2">{children}</div>}
    </div>
  );
}

function DarwinboxSyncModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<any>(null);

  const loadPreview = (refresh = false) => {
    setLoading(true);
    setError("");
    api.get(`/data/darwinbox/sync/preview${refresh ? "?refresh=1" : ""}`)
      .then(setPlan)
      .catch((e) => setError(e.message || "Preview failed."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadPreview(); }, []);

  const apply = async () => {
    const s = plan?.summary;
    const ok = await confirm({
      title: "Apply Darwinbox sync?",
      message: `This will create ${s?.creates || 0} instructor(s), update ${s?.changedFields || 0} field(s) across ${s?.updates || 0} instructor(s), and mark ${s?.exits || 0} as Exited. Darwinbox values overwrite FacultyOps values for synced fields.`,
      confirmText: "Apply sync",
      danger: false,
    });
    if (!ok) return;
    setApplying(true);
    try {
      const r = await api.post("/data/darwinbox/sync/apply");
      setReport(r);
      toast.success(`Sync done: ${r.created} created, ${r.updated} updated, ${r.exited} exited.`);
      onApplied();
    } catch (e: any) {
      toast.error(e.message || "Sync failed.");
    } finally {
      setApplying(false);
    }
  };

  const s = plan?.summary;
  const included = (plan?.departments || []).filter((d: any) => d.included);
  const excluded = (plan?.departments || []).filter((d: any) => !d.included);

  return (
    <Modal title="Sync Darwinbox → Instructor Master" onClose={onClose} wide>
      {loading && <Loading />}

      {!loading && error && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-rose-600"><AlertTriangle className="h-5 w-5" /><span className="text-sm font-medium">Preview failed</span></div>
          <p className="text-sm text-slate-600">{error}</p>
          <button onClick={() => loadPreview(true)} className="btn btn-primary btn-sm">Retry</button>
        </div>
      )}

      {!loading && !error && report && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-5 w-5" /><span className="font-semibold">Sync applied</span></div>
          <ul className="space-y-1 text-sm text-slate-700">
            <li>• {report.created} instructor(s) created</li>
            <li>• {report.updated} instructor(s) updated ({report.changedFields} field change(s))</li>
            <li>• {report.exited} marked as Exited</li>
            <li>• {report.skipped} skipped</li>
          </ul>
          {!!report.errors?.length && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="mb-1 font-semibold">{report.errors.length} error(s):</div>
              {report.errors.slice(0, 20).map((e: string, i: number) => <div key={i}>{e}</div>)}
            </div>
          )}
          <p className="text-xs text-slate-500">Every change is recorded in the Audit Log (reason: "Darwinbox sync").</p>
          <div className="flex justify-end"><button onClick={onClose} className="btn btn-primary btn-sm">Done</button></div>
        </div>
      )}

      {!loading && !error && plan && !report && (
        <div className="space-y-4">
          {/* Scope: only instructor departments are synced */}
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">{s.inScope}</span> of {s.darwinboxTotal} Darwinbox employee(s) are in scope
            ({included.length} instructor department(s); {excluded.length} other department(s) ignored).
            Matching key: <span className="font-medium">Employee ID</span>. Darwinbox wins on synced fields; CM mapping, contribution, payroll and other FacultyOps-managed fields are never touched.
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { n: s.creates, l: "New instructors", c: "text-emerald-600" },
              { n: s.updates, l: `Updates (${s.changedFields} fields)`, c: "text-brand-600" },
              { n: s.exits, l: "Exits", c: "text-rose-600" },
              { n: s.skipped, l: "Skipped", c: "text-amber-600" },
            ].map((k) => (
              <div key={k.l} className="rounded-lg border border-slate-200 p-3 text-center">
                <div className={`text-xl font-bold ${k.c}`}>{k.n}</div>
                <div className="text-[11px] text-slate-500">{k.l}</div>
              </div>
            ))}
          </div>

          {!!plan.unmapped?.length && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-semibold">Fields not found in the Darwinbox response:</span> {plan.unmapped.join(", ")} — these are skipped until the column names are mapped.
            </div>
          )}

          <div className="space-y-2">
            <Section title="Departments in scope" count={included.length}>
              {included.map((d: any) => <div key={d.name} className="flex justify-between py-0.5 text-xs"><span>{d.name}</span><span className="text-slate-400">{d.count}</span></div>)}
            </Section>
            <Section title="Departments ignored (not ours)" count={excluded.length} tone="bg-slate-100 text-slate-500">
              {excluded.map((d: any) => <div key={d.name} className="flex justify-between py-0.5 text-xs text-slate-500"><span>{d.name}</span><span>{d.count}</span></div>)}
            </Section>
            <Section title="Field mapping (Darwinbox column → FacultyOps field)" count={plan.mapping?.length || 0}>
              {(plan.mapping || []).map((m: any) => <div key={m.target} className="flex justify-between py-0.5 text-xs"><span className="font-medium">{m.label}</span><span className="text-slate-400">← {m.source}</span></div>)}
            </Section>
            <Section title="New instructors to create" count={plan.creates?.length || 0} tone="bg-emerald-50 text-emerald-700">
              {(plan.creates || []).map((c: any) => (
                <div key={c.employeeId} className="py-0.5 text-xs">
                  <span className="font-medium">{c.employeeId}</span> — {c.name} {c.email && <span className="text-slate-400">({c.email})</span>} {c.exited && <span className="chip bg-rose-50 text-rose-600">exited</span>}
                </div>
              ))}
            </Section>
            <Section title="Instructors with field updates" count={plan.updates?.length || 0}>
              {(plan.updates || []).map((u: any) => (
                <div key={u.id} className="border-b border-slate-50 py-1.5 text-xs last:border-0">
                  <div className="font-medium">{u.employeeId} — {u.name}</div>
                  {u.changes.map((ch: any) => (
                    <div key={ch.key} className="ml-2 text-slate-500">
                      {ch.label}: <span className="text-rose-500 line-through">{ch.old || "—"}</span> → <span className="font-medium text-emerald-600">{ch.new}</span>
                    </div>
                  ))}
                </div>
              ))}
            </Section>
            <Section title="Instructors to mark as Exited" count={plan.exits?.length || 0} tone="bg-rose-50 text-rose-600">
              {(plan.exits || []).map((x: any) => <div key={x.id} className="py-0.5 text-xs"><span className="font-medium">{x.employeeId}</span> — {x.name}{x.exitDate && <span className="text-slate-400"> (LWD {x.exitDate})</span>}</div>)}
            </Section>
            <Section title="Skipped rows" count={plan.skipped?.length || 0} tone="bg-amber-50 text-amber-700">
              {(plan.skipped || []).map((sk: any, i: number) => <div key={i} className="py-0.5 text-xs"><span className="font-medium">{sk.employeeId || "?"}</span> — {sk.reason}</div>)}
            </Section>
            <Section title="In FacultyOps but not in Darwinbox (no action)" count={plan.notInDarwinbox?.length || 0} tone="bg-slate-100 text-slate-500">
              {(plan.notInDarwinbox || []).map((m: any) => <div key={m.employeeId} className="py-0.5 text-xs text-slate-500">{m.employeeId} — {m.name}</div>)}
            </Section>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <button onClick={() => loadPreview(true)} className="btn btn-ghost btn-sm" disabled={applying}><RefreshCw className="h-4 w-4" /> Re-preview</button>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn btn-ghost btn-sm" disabled={applying}>Cancel</button>
              <button onClick={apply} className="btn btn-primary btn-sm disabled:opacity-50" disabled={applying || (!s.creates && !s.updates && !s.exits)}>
                {applying ? "Applying…" : "Apply sync"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
