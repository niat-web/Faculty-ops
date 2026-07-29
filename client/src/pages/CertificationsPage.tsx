import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Download, SlidersHorizontal, X, ExternalLink } from "lucide-react";
import Papa from "papaparse";
import { api } from "../api";
import { useToast } from "../toast";
import { isAbort } from "../hooks";
import SearchInput from "../components/SearchInput";
import MultiSelect from "../components/MultiSelect";
import { SkeletonRows } from "../components/scaffold";
import type { CertSchema } from "../certForm";

type Cert = { id: string; employeeId: string; createdAt: string; answers: Record<string, string> };
type Filters = { department: string[]; from: string; to: string };
const EMPTY: Filters = { department: [], from: "", to: "" };

export default function CertificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Cert[] | null>(null);
  const [schema, setSchema] = useState<CertSchema | null>(null);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    api.get("/certifications", { signal: ac.signal })
      .then((r) => { setItems(r.items || []); setSchema(r.schema || null); })
      .catch((e) => { if (!isAbort(e)) toast.error(e.message); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fields = schema?.fields || [];

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const c of items || []) {
      const d = c.answers?.department?.trim();
      if (d) s.add(d);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items || []).filter((c) => {
      if (applied.department.length) {
        const dept = c.answers?.department?.trim() || "";
        if (!applied.department.includes(dept)) return false;
      }
      if (applied.from) {
        const d = new Date(c.createdAt);
        if (d < new Date(`${applied.from}T00:00:00`)) return false;
      }
      if (applied.to) {
        const d = new Date(c.createdAt);
        if (d > new Date(`${applied.to}T23:59:59.999`)) return false;
      }
      if (!needle) return true;
      const hay = [c.employeeId, ...fields.map((f) => c.answers?.[f.key] || "")].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, applied, fields]);

  const activeCount = (applied.department.length ? 1 : 0) + (applied.from ? 1 : 0) + (applied.to ? 1 : 0);
  const openDrawer = () => { setDraft(applied); setDrawer(true); };
  const applyFilters = () => { setApplied(draft); setDrawer(false); };
  const clearAll = () => { setApplied(EMPTY); setDraft(EMPTY); };

  function exportCsv() {
    const header = [...fields.map((f) => f.label), "Submitted"];
    const rows = filtered.map((c) => [
      ...fields.map((f) => {
        const v = c.answers?.[f.key] || "";
        return f.type === "FILE" ? (v ? "File link" : "") : v;
      }),
      new Date(c.createdAt).toLocaleString(),
    ]);
    const csv = Papa.unparse([header, ...rows]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "certifications.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <GraduationCap className="h-6 w-6 text-brand-600" />
            Certifications
            <span className="text-base font-medium text-slate-400">· {items === null ? "…" : filtered.length.toLocaleString()}</span>
          </h1>
          <p className="text-sm text-slate-500">All certificate form submissions, newest first.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput onSearch={setQ} placeholder="Employee ID, name, email, department…" />
          <button onClick={openDrawer} className="btn btn-ghost btn-sm shrink-0">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>}
          </button>
          {activeCount > 0 && <button onClick={clearAll} className="text-sm font-medium text-rose-600 hover:text-rose-700">Clear filters</button>}
          <button onClick={exportCsv} disabled={!items?.length} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</button>
        </div>
      </div>

      <div className="table-shell page-bleed overflow-hidden">
        <div className="table-shell-header border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">
          {items === null ? "Loading…" : `${filtered.length} submission(s)`}
        </div>
        <div className="data-grid-scroll">
          <table className="data-grid-table whitespace-nowrap">
            <thead className="table-head-row bg-gray-50 text-left">
              <tr>
                {fields.map((f) => <th key={f.id} className="table-head-cell">{f.label}</th>)}
                <th className="table-head-cell">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {items === null ? <SkeletonRows rows={10} cols={(fields.length || 6) + 1} cellClass="table-body-cell" /> : <>
                {filtered.map((c) => (
                  <tr key={c.id} className="table-body-row">
                    {fields.map((f) => {
                      const v = c.answers?.[f.key] || "";
                      return (
                        <td key={f.id} className="table-body-cell max-w-[260px] truncate text-gray-600" title={f.type === "FILE" ? "" : v}>
                          {f.type === "FILE" ? <CertLink url={v} /> : (v || <span className="text-gray-300">—</span>)}
                        </td>
                      );
                    })}
                    <td className="table-body-cell whitespace-nowrap text-xs text-gray-500">{new Date(c.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={(fields.length || 6) + 1} className="table-body-cell py-16 text-center text-gray-400">No submissions match your search / filters.</td></tr>}
              </>}
            </tbody>
          </table>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filters</h2>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div>
                <label className="label">Department</label>
                <MultiSelect values={draft.department} onChange={(v) => setDraft({ ...draft, department: v })} options={departments.map((d) => ({ value: d, label: d }))} placeholder="All departments" />
              </div>
              <div className="border-t border-slate-100 pt-4">
                <label className="label">Submitted date range</label>
                <div className="flex items-center gap-2">
                  <input type="date" className="input" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
                  <span className="text-slate-400">→</span>
                  <input type="date" className="input" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setDraft(EMPTY)} className="btn btn-ghost btn-sm">Clear</button>
              <button onClick={applyFilters} className="btn btn-primary btn-sm">Apply filters</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CertLink({ url }: { url: string }) {
  if (!url) return <span className="text-gray-300">—</span>;
  return <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">View <ExternalLink className="h-3 w-3" /></a>;
}
