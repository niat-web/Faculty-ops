import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, X } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { Role, ROLE_LABEL } from "@/lib/enums.js";
import PageHeader from "@/components/PageHeader.js";
import UserManager from "@/components/UserManager.js";
import AddUserButton from "@/components/AddUserButton.js";

export default async function UsersPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageUsers(user)) redirect("/app");

  await connectDB();
  const q = (searchParams?.q || "").trim();
  const roleFilter = (searchParams?.role || "").trim();

  const all = await User.find().sort({ role: 1, name: 1 }).lean();
  const seniors = all.filter((u) => u.role === Role.SENIOR_MANAGER).map((u) => ({ id: String(u._id), name: u.name }));

  let users = all;
  if (roleFilter) users = users.filter((u) => u.role === roleFilter);
  if (q) users = users.filter((u) =>
    u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()));
  const hasFilters = q || roleFilter;

  return (
    <div className="space-y-5">
      <PageHeader title="Users" subtitle="Manage who can access the CRM and their roles. Capability Managers report to a Senior Manager for approvals.">
        <AddUserButton seniors={seniors} />
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
        seniors={seniors}
        meId={user.id}
        users={users.map((u) => ({
          id: String(u._id), name: u.name, email: u.email, role: u.role, active: u.active,
          mustSetPassword: !!u.mustSetPassword,
          managerId: u.managerId ? String(u.managerId) : "",
          managerName: u.managerId ? all.find((m) => String(m._id) === String(u.managerId))?.name : null,
        }))}
      />
    </div>
  );
}
