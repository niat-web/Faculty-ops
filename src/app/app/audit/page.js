import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Search, X } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { AuditLog } from "@/models/index.js";
import { canViewAudit } from "@/lib/rbac.js";
import { AuditAction } from "@/lib/enums.js";
import { escapeRegex } from "@/lib/text.js";
import PageHeader from "@/components/PageHeader.js";

export default async function AuditPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canViewAudit(user)) redirect("/app");

  await connectDB();
  const q = (searchParams?.q || "").trim();
  const action = (searchParams?.action || "").trim();

  const filter = {};
  if (q) { const rx = escapeRegex(q); filter.$or = [
    { actorName: { $regex: rx, $options: "i" } },
    { instructorName: { $regex: rx, $options: "i" } },
    { fieldName: { $regex: rx, $options: "i" } },
  ]; }
  if (action) filter.action = action;

  const limit = 50;
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);
  const total = await AuditLog.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const entries = await AuditLog.find(filter).sort({ createdAt: -1 })
    .skip((page - 1) * limit).limit(limit).lean();
  const exportQs = new URLSearchParams({ q, action }).toString();
  const hasFilters = q || action;
  const pageParams = Object.fromEntries(Object.entries({ q, action }).filter(([, v]) => v));

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Log" subtitle="Immutable record of every change — newest first. Cannot be edited or deleted by anyone.">
        <a href={`/api/audit/export?${exportQs}`} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</a>
      </PageHeader>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Person, instructor or field…" className="input pl-9" />
        </div>
        <div>
          <label className="label">Action</label>
          <select name="action" defaultValue={action} className="input w-52">
            <option value="">All actions</option>
            {Object.values(AuditAction).map((a) => <option key={a} value={a}>{a.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm">Apply</button>
        {hasFilters && <Link href="/app/audit" className="btn btn-ghost btn-sm"><X className="h-4 w-4" /> Clear</Link>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-5 py-3">When</th><th className="px-5 py-3">Who</th><th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Instructor</th><th className="px-5 py-3">Field</th><th className="px-5 py-3">Change</th>
              <th className="px-5 py-3">Reason</th><th className="px-5 py-3">Proof</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((e) => (
              <tr key={String(e._id)} className="hover:bg-slate-50">
                <td className="px-5 py-3 text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="px-5 py-3"><div className="font-medium">{e.actorName}</div><div className="text-xs text-slate-400">{e.actorRole}</div></td>
                <td className="px-5 py-3"><span className="chip chip-gray">{e.action.replace(/_/g, " ").toLowerCase()}</span></td>
                <td className="px-5 py-3">{e.instructorName || "—"}</td>
                <td className="px-5 py-3">{e.fieldName || "—"}</td>
                <td className="px-5 py-3 text-slate-500">{e.oldValue != null || e.newValue != null ? `${e.oldValue ?? "—"} → ${e.newValue ?? "—"}` : "—"}</td>
                <td className="px-5 py-3 text-slate-400">{e.reason || "—"}</td>
                <td className="px-5 py-3">{e.proofPath ? <Link href={`/api/proof?path=${encodeURIComponent(e.proofPath)}`} className="text-brand-600 hover:underline">view</Link> : "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">No audit entries match.</td></tr>}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
            <span className="text-slate-400">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
            <div className="flex gap-2">
              <AuditPageLink page={page - 1} disabled={page <= 1} params={pageParams} label="← Prev" />
              <AuditPageLink page={page + 1} disabled={page >= totalPages} params={pageParams} label="Next →" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditPageLink({ page, disabled, params, label }) {
  if (disabled) return <span className="btn btn-ghost btn-sm cursor-not-allowed opacity-40">{label}</span>;
  const qs = new URLSearchParams({ ...params, page: String(page) }).toString();
  return <Link href={`/app/audit?${qs}`} className="btn btn-ghost btn-sm">{label}</Link>;
}
