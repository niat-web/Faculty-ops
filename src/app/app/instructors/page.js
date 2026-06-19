import Link from "next/link";
import { Search, Download, Plus, UploadCloud, X } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, User } from "@/models/index.js";
import { instructorScopeFilter, canManageUsers, canManageMapping } from "@/lib/rbac.js";
import { Role, LIFECYCLE_LABEL } from "@/lib/enums.js";
import { escapeRegex } from "@/lib/text.js";
import PageHeader from "@/components/PageHeader.js";
import SavedViews from "@/components/SavedViews.js";
import InstructorsTable from "@/components/InstructorsTable.js";

export default async function InstructorsPage({ searchParams }) {
  const user = await getCurrentUser();
  await connectDB();
  const q = (searchParams?.q || "").trim();
  const status = (searchParams?.status || "").trim();
  const campus = (searchParams?.campus || "").trim();
  const managerId = (searchParams?.managerId || "").trim();
  const minTraining = parseInt(searchParams?.minTraining || "", 10);

  const scope = instructorScopeFilter(user);
  const filter = { $and: [scope] };
  if (q) { const rx = escapeRegex(q); filter.$and.push({ $or: [
    { name: { $regex: rx, $options: "i" } },
    { employeeId: { $regex: rx, $options: "i" } },
    { campus: { $regex: rx, $options: "i" } },
    { uid: { $regex: rx, $options: "i" } },
  ]}); }
  if (status) filter.$and.push({ status });
  if (campus) filter.$and.push({ campus });
  if (managerId) filter.$and.push({ currentManagerId: managerId });
  // Training filter at the DB layer so it composes with pagination.
  if (!isNaN(minTraining)) filter.$and.push({
    $expr: { $gte: [{ $toInt: { $ifNull: ["$values.primary_pct", "0"] } }, minTraining] },
  });

  // Pagination
  const limit = 25;
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);
  const total = await Instructor.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const list = await Instructor.find(filter)
    .sort({ employeeId: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // Filter dropdown sources (respect scope so a CM only sees their own campuses/managers).
  const scoped = await Instructor.find(scope).select("campus currentManagerId").lean();
  const campuses = [...new Set(scoped.map((i) => i.campus).filter(Boolean))].sort();
  const mgrIdsInScope = [...new Set(scoped.filter((i) => i.currentManagerId).map((i) => String(i.currentManagerId)))];
  const managers = await User.find({ _id: { $in: mgrIdsInScope } }).select("name").sort({ name: 1 }).lean();
  const mgrMap = Object.fromEntries(managers.map((m) => [String(m._id), m.name]));

  const savedDoc = await User.findById(user.id).select("savedViews").lean();
  const savedViews = (savedDoc?.savedViews || []).map((v) => ({ id: String(v._id), name: v.name, query: v.query }));

  const showMgrFilter = user.role !== Role.CAPABILITY_MANAGER && user.role !== Role.INSTRUCTOR;
  const scopeNote =
    user.role === Role.CAPABILITY_MANAGER ? "Showing only your reportees."
    : user.role === Role.INSTRUCTOR ? "Showing your own profile."
    : "Showing all instructors (organization-wide).";

  const exportQs = new URLSearchParams({ q, status, campus, managerId }).toString();
  // Filter params carried across pagination links (omit empties).
  const pageParams = Object.fromEntries(
    Object.entries({ q, status, campus, managerId, minTraining: isNaN(minTraining) ? "" : String(minTraining) })
      .filter(([, v]) => v)
  );
  const activeFilters = [
    q && { label: `Search: ${q}`, param: "q" },
    status && { label: LIFECYCLE_LABEL[status] || status, param: "status" },
    campus && { label: `Campus: ${campus}`, param: "campus" },
    managerId && { label: `Manager: ${mgrMap[managerId] || "?"}`, param: "managerId" },
    !isNaN(minTraining) && { label: `Training ≥ ${minTraining}%`, param: "minTraining" },
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader title="Instructors" subtitle={scopeNote}>
        <a href={`/api/instructors/export?${exportQs}`} className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</a>
        {canManageUsers(user) && <>
          <Link href="/app/import" className="btn btn-ghost btn-sm"><UploadCloud className="h-4 w-4" /> Import</Link>
          <Link href="/app/instructors/new" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Add instructor</Link>
        </>}
      </PageHeader>

      {/* Filter toolbar */}
      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[200px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Name, ID, UID, campus…" className="input pl-9" />
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={status} className="input w-40">
            <option value="">All</option>
            {Object.entries(LIFECYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Campus</label>
          <select name="campus" defaultValue={campus} className="input w-40">
            <option value="">All</option>
            {campuses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {showMgrFilter && (
          <div>
            <label className="label">Manager</label>
            <select name="managerId" defaultValue={managerId} className="input w-44">
              <option value="">All</option>
              {managers.map((m) => <option key={String(m._id)} value={String(m._id)}>{m.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Min training %</label>
          <input name="minTraining" type="number" min="0" max="100" defaultValue={isNaN(minTraining) ? "" : minTraining} placeholder="0" className="input w-28" />
        </div>
        <button className="btn btn-primary btn-sm">Apply</button>
        {activeFilters.length > 0 && <Link href="/app/instructors" className="btn btn-ghost btn-sm"><X className="h-4 w-4" /> Clear</Link>}
      </form>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((f) => <span key={f.param} className="chip chip-gray">{f.label}</span>)}
        </div>
      )}

      <SavedViews views={savedViews} currentQuery={new URLSearchParams(pageParams).toString()} />

      <InstructorsTable
        rows={list.map((i) => ({
          id: String(i._id), employeeId: i.employeeId, name: i.name, campus: i.campus,
          managerName: mgrMap[String(i.currentManagerId)] || null,
          trainingPct: i.values?.primary_pct != null && i.values.primary_pct !== "" ? Number(i.values.primary_pct) : null,
          statusLabel: LIFECYCLE_LABEL[i.status] || i.status,
        }))}
        managers={managers.map((m) => ({ id: String(m._id), name: m.name }))}
        statuses={LIFECYCLE_LABEL}
        canManage={canManageMapping(user)}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="text-slate-400">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <PageLink page={page - 1} disabled={page <= 1} params={pageParams} label="← Prev" />
            <PageLink page={page + 1} disabled={page >= totalPages} params={pageParams} label="Next →" />
          </div>
        </div>
      )}
    </div>
  );
}

function PageLink({ page, disabled, params, label }) {
  if (disabled) return <span className="btn btn-ghost btn-sm cursor-not-allowed opacity-40">{label}</span>;
  const qs = new URLSearchParams({ ...params, page: String(page) }).toString();
  return <Link href={`/app/instructors?${qs}`} className="btn btn-ghost btn-sm">{label}</Link>;
}
