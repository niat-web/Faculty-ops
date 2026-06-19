import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, X } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { EditRequest } from "@/models/index.js";
import { canApproveRequests, canSubmitRequests } from "@/lib/rbac.js";
import { RequestStatus } from "@/lib/enums.js";
import PageHeader from "@/components/PageHeader.js";
import DecisionForm from "@/components/DecisionForm.js";
import CommentThread from "@/components/CommentThread.js";

const STATUS_CHIP = { PENDING: "chip-necessary", APPROVED: "chip-public", REJECTED: "chip-sensitive" };

export default async function RequestsPage({ searchParams }) {
  const user = await getCurrentUser();
  const isApprover = canApproveRequests(user);
  const isRequester = canSubmitRequests(user);
  if (!isApprover && !isRequester) redirect("/app");

  await connectDB();
  const q = (searchParams?.q || "").trim();
  const statusFilter = (searchParams?.status || "").trim();

  const base = isApprover ? { approverId: user.id } : { requesterId: user.id };
  const all = await EditRequest.find(base).sort({ status: 1, createdAt: -1 }).lean();
  const pending = all.filter((r) => r.status === "PENDING");

  let decided = all.filter((r) => r.status !== "PENDING");
  if (statusFilter) decided = decided.filter((r) => r.status === statusFilter);
  if (q) decided = decided.filter((r) =>
    (r.instructorName || "").toLowerCase().includes(q.toLowerCase()) ||
    (r.fieldLabel || "").toLowerCase().includes(q.toLowerCase()));
  const hasFilters = q || statusFilter;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Requests"
        subtitle={isApprover ? "Requests awaiting your approval, plus your decision history." : "Requests you have submitted."}
      />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Pending ({pending.length})</h2>
        <div className="space-y-3">
          {pending.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">Nothing pending. 🎉</div>}
          {pending.map((r) => (
            <div key={String(r._id)} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <Link href={`/app/instructors/${r.instructorId}`} className="font-semibold text-brand-700 hover:underline">{r.instructorName}</Link>
                  <p className="mt-1 text-sm"><span className="font-medium">{r.fieldLabel}:</span> <span className="text-slate-400">{r.oldValue || "—"}</span> → <span className="font-semibold">{r.newValue}</span></p>
                  <p className="mt-1 text-sm text-slate-500">Reason: {r.reason}</p>
                  <p className="mt-1 text-xs text-slate-400">Requested by {r.requesterName}</p>
                  {r.proofPath && <a href={`/api/proof?path=${encodeURIComponent(r.proofPath)}`} className="mt-1 inline-block text-xs text-brand-600 hover:underline">View proof document</a>}
                </div>
                <span className={`chip ${STATUS_CHIP[r.status]}`}>{r.status}</span>
              </div>
              {isApprover && <DecisionForm requestId={String(r._id)} />}
              <CommentThread
                requestId={String(r._id)}
                comments={(r.comments || []).map((c) => ({ id: String(c._id), authorName: c.authorName, body: c.body, createdAt: c.createdAt }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">History ({decided.length})</h2>
        </div>
        <form method="get" className="card mb-3 flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <label className="label">Search</label>
            <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Instructor or field…" className="input pl-9" />
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={statusFilter} className="input w-40">
              <option value="">All</option>
              {[RequestStatus.APPROVED, RequestStatus.REJECTED].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm">Apply</button>
          {hasFilters && <Link href="/app/requests" className="btn btn-ghost btn-sm"><X className="h-4 w-4" /> Clear</Link>}
        </form>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3">Instructor</th><th className="px-5 py-3">Field</th><th className="px-5 py-3">Change</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Comment</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {decided.map((r) => (
                <tr key={String(r._id)}>
                  <td className="px-5 py-3">{r.instructorName}</td>
                  <td className="px-5 py-3">{r.fieldLabel}</td>
                  <td className="px-5 py-3 text-slate-500">{r.oldValue || "—"} → {r.newValue}</td>
                  <td className="px-5 py-3"><span className={`chip ${STATUS_CHIP[r.status]}`}>{r.status}</span></td>
                  <td className="px-5 py-3 text-slate-400">{r.decisionComment || "—"}</td>
                </tr>
              ))}
              {decided.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No matching history.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
