import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, X } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { Role, ROLE_LABEL } from "@/lib/enums.js";
import { escapeRegex } from "@/lib/text.js";
import PageHeader from "@/components/PageHeader.js";
import UserManager from "@/components/UserManager.js";
import AddUserButton from "@/components/AddUserButton.js";

const PER = 50;

export default async function UsersPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageUsers(user)) redirect("/app");

  await connectDB();
  const q = (searchParams?.q || "").trim();
  const roleFilter = (searchParams?.role || "").trim();
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);

  // Build a DB-level query so we only fetch one page, not all ~700 users.
  const query = {};
  if (roleFilter) query.role = roleFilter;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ name: rx }, { email: rx }];
  }

  const [total, users, seniors] = await Promise.all([
    User.countDocuments(query),
    User.find(query).sort({ role: 1, name: 1 }).skip((page - 1) * PER).limit(PER).lean(),
    User.find({ role: Role.SENIOR_MANAGER }).select("name").sort({ name: 1 }).lean(),
  ]);

  // Resolve manager names just for the users on this page.
  const mgrIds = [...new Set(users.map((u) => u.managerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m) => [String(m._id), m.name]));

  const seniorOpts = seniors.map((u) => ({ id: String(u._id), name: u.name }));
  const pages = Math.max(1, Math.ceil(total / PER));
  const hasFilters = q || roleFilter;
  const qs = (p) => `/app/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(roleFilter ? { role: roleFilter } : {}), page: String(p) })}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Users" subtitle="Manage who can access the CRM and their roles. Capability Managers report to a Senior Manager for approvals.">
        <AddUserButton seniors={seniorOpts} />
      </PageHeader>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <label className="label">Search</label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Name or email…" className="input pl-9" />
        </div>
        <div>
          <label className="label">Role</label>
          <select name="role" defaultValue={roleFilter} className="input w-52">
            <option value="">All roles</option>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm">Apply</button>
        {hasFilters && <Link href="/app/users" className="btn btn-ghost btn-sm"><X className="h-4 w-4" /> Clear</Link>}
      </form>

      <UserManager
        seniors={seniorOpts}
        meId={user.id}
        users={users.map((u) => ({
          id: String(u._id), name: u.name, email: u.email, role: u.role, active: u.active,
          mustSetPassword: !!u.mustSetPassword,
          managerId: u.managerId ? String(u.managerId) : "",
          managerName: u.managerId ? mgrName[String(u.managerId)] || null : null,
        }))}
      />

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} user(s) · page {page} of {pages}</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={qs(page - 1)} className="btn btn-ghost btn-sm">← Prev</Link>}
          {page < pages && <Link href={qs(page + 1)} className="btn btn-ghost btn-sm">Next →</Link>}
        </div>
      </div>
    </div>
  );
}
