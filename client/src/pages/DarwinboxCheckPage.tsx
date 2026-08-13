import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, Search, RefreshCw, Download, CheckCircle2, XCircle, AlertTriangle, Server } from "lucide-react";
import { api, API_BASE } from "../api";
import { useToast } from "../toast";
import Pagination from "../components/Pagination";

// Standalone Darwinbox data checker: confirm the DARWINBOX_* env keys work and browse the raw
// employee master. Read-only — hits /api/darwinbox-check, which reuses the app's Darwinbox client.

type Status = { configured: boolean; missing: string[]; endpoint: string | null };
type Page = { ok: boolean; columns: string[]; rows: Record<string, any>[]; total: number; fetchedAt: string; source?: string; note?: string; error?: string };

const REQUIRED = ["DBX_CHECK_ENDPOINT", "DBX_CHECK_USERNAME", "DBX_CHECK_PASSWORD", "DBX_CHECK_API_KEY", "DBX_CHECK_REPORT_ID"];

export default function DarwinboxCheckPage() {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const [per, setPer] = useState(50);
  const reqId = useRef(0);

  useEffect(() => { api.get<Status>("/darwinbox-check/status").then(setStatus).catch(() => {}); }, []);

  const load = useCallback(async (refresh = false) => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const offset = (pageNum - 1) * per;
      const params = new URLSearchParams({ limit: String(per), offset: String(offset) });
      if (q.trim()) params.set("q", q.trim());
      if (refresh) params.set("refresh", "1");
      const p = await api.get<Page>(`/darwinbox-check/rows?${params}`);
      if (id !== reqId.current) return; // a newer request superseded this one
      setPage(p);
      if (!p.ok) setError(p.error || "Darwinbox fetch failed.");
    } catch (e: any) {
      if (id !== reqId.current) return;
      setError(e?.message || "Request failed.");
      setPage(null);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [pageNum, per, q]);

  // Load whenever the page/size changes (search is applied on Enter/button — see onSearch).
  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [pageNum, per]);

  const onSearch = () => { if (pageNum !== 1) setPageNum(1); else load(false); };
  const onRefresh = async () => {
    await Promise.all([api.get<Status>("/darwinbox-check/status").then(setStatus).catch(() => {}), load(true)]);
    if (!error) toast.success("Refreshed from Darwinbox.");
  };

  const csvHref = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const s = params.toString();
    return `${API_BASE}/api/darwinbox-check/export.csv${s ? `?${s}` : ""}`;
  }, [q]);

  const pages = page ? Math.max(1, Math.ceil(page.total / per)) : 1;
  const configured = status?.configured;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Database className="h-5 w-5" strokeWidth={1.75} /></span>
          <div>
            <h1 className="page-title">Exited Employees (Darwinbox)</h1>
            <p className="text-sm text-slate-500">Left / resigned / separated employees, from a Darwinbox Report Builder report. Read-only.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} disabled={loading} className="btn btn-outline btn-sm">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} /> Refresh
          </button>
          <a href={csvHref} className={`btn btn-outline btn-sm ${!configured || !page?.ok ? "pointer-events-none opacity-50" : ""}`}>
            <Download className="h-4 w-4" strokeWidth={1.75} /> Export CSV
          </a>
        </div>
      </div>

      {/* Connection / configuration status banner */}
      <StatusBanner status={status} page={page} error={error} loading={loading} />

      {/* Config checklist — shown until all 5 vars are present */}
      {status && !configured && (
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Server className="h-4 w-4 text-slate-500" strokeWidth={1.75} /> Required environment variables (add to <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">server/.env</code>, then restart the server)
          </div>
          <ul className="space-y-1.5">
            {REQUIRED.map((k) => {
              const present = !status.missing.includes(k);
              return (
                <li key={k} className="flex items-center gap-2 text-sm">
                  {present
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
                    : <XCircle className="h-4 w-4 shrink-0 text-rose-500" strokeWidth={2} />}
                  <code className="text-[13px] text-slate-700">{k}</code>
                  <span className={present ? "text-emerald-600" : "text-rose-500"}>{present ? "set" : "missing"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Toolbar (search) — only useful once configured */}
      {configured && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.75} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
              placeholder="Search all columns…"
              className="input h-9 w-72 pl-9"
            />
          </div>
          <button onClick={onSearch} className="btn btn-primary btn-sm">Search</button>
          {q && <button onClick={() => { setQ(""); setPageNum(1); }} className="btn btn-ghost btn-sm">Clear</button>}
          {page?.ok && <span className="ml-1 text-sm text-slate-500">{page.total.toLocaleString()} row{page.total === 1 ? "" : "s"}</span>}
        </div>
      )}

      {/* Data table */}
      {configured && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">#</th>
                  {(page?.columns || []).map((c) => (
                    <th key={c} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (!page || !page.rows.length) && (
                  <tr><td colSpan={(page?.columns?.length || 0) + 1} className="px-4 py-10 text-center text-sm text-slate-400">Loading…</td></tr>
                )}
                {!loading && page?.ok && !page.rows.length && (
                  <tr><td colSpan={(page.columns.length || 0) + 1} className="px-4 py-10 text-center text-sm text-slate-400">No rows match.</td></tr>
                )}
                {page?.rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 text-[12px] text-slate-400">{(pageNum - 1) * per + i + 1}</td>
                    {page.columns.map((c) => {
                      const val = String(row[c] ?? "");
                      // Color-code the computed "Employment State" column: exited vs still-on-notice.
                      if (c === "Employment State" && val) {
                        const exited = /exited/i.test(val);
                        return (
                          <td key={c} className="whitespace-nowrap px-3 py-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${exited ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/10" : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10"}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${exited ? "bg-rose-500" : "bg-amber-500"}`} />{val}
                            </span>
                          </td>
                        );
                      }
                      return <td key={c} className="max-w-[320px] truncate whitespace-nowrap px-3 py-2 text-slate-700" title={val}>{val || <span className="text-slate-300">—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page?.ok && page.total > 0 && (
            <div className="border-t border-slate-200 px-3 py-2">
              <Pagination page={pageNum} pages={pages} per={per} total={page.total} onPage={setPageNum} onPer={(n) => { setPer(n); setPageNum(1); }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBanner({ status, page, error, loading }: { status: Status | null; page: Page | null; error: string | null; loading: boolean }) {
  if (!status) return null;
  if (!status.configured) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
        <div>Darwinbox is <b>not configured</b>. Add the {status.missing.length} missing variable{status.missing.length === 1 ? "" : "s"} below to <code className="rounded bg-amber-100 px-1">server/.env</code> and restart the server.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
        <div><b>Connection failed.</b> {error}</div>
      </div>
    );
  }
  if (page?.ok) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" strokeWidth={2} /> Connected</span>
          <span>{page.total.toLocaleString()} exited employee{page.total === 1 ? "" : "s"} · {page.columns.length} columns</span>
          <span className="text-emerald-700/70">Fetched {new Date(page.fetchedAt).toLocaleString()}</span>
        </div>
        {page.note && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} /><div>{page.note}</div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">{loading ? "Connecting to Darwinbox…" : "Ready — click Refresh to fetch data."}</div>
  );
}
