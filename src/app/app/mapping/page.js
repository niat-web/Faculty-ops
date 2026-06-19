import { redirect } from "next/navigation";
import Link from "next/link";
import { Users2, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, User } from "@/models/index.js";
import { canManageMapping } from "@/lib/rbac.js";
import { Role } from "@/lib/enums.js";
import PageHeader from "@/components/PageHeader.js";
import MappingManager from "@/components/MappingManager.js";

export default async function MappingPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageMapping(user)) redirect("/app");
  const tab = searchParams?.tab === "managers" ? "managers" : "reassign";

  await connectDB();
  const [cms, sms, instructors, counts] = await Promise.all([
    User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name managerId").sort({ name: 1 }).lean(),
    User.find({ role: Role.SENIOR_MANAGER, active: true }).select("name").lean(),
    Instructor.find().select("name employeeId currentManagerId campus").sort({ employeeId: 1 }).lean(),
    Instructor.aggregate([{ $group: { _id: "$currentManagerId", n: { $sum: 1 } } }]),
  ]);
  const smName = Object.fromEntries(sms.map((s) => [String(s._id), s.name]));
  const countByCm = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));

  const cmList = cms.map((c) => ({ id: String(c._id), name: c.name }));
  const instList = instructors.map((i) => ({
    id: String(i._id), name: i.name, employeeId: i.employeeId, campus: i.campus,
    managerId: i.currentManagerId ? String(i.currentManagerId) : null,
  }));
  const managerRows = cms.map((c) => ({
    id: String(c._id), name: c.name,
    reportsTo: c.managerId ? (smName[String(c.managerId)] || "—") : "— unassigned —",
    reportees: countByCm[String(c._id)] || 0,
  }));

  const TabLink = ({ id, label, count }) => (
    <Link
      href={`/app/mapping?tab=${id}`}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}{count != null && <span className="ml-1.5 text-xs text-slate-400">({count})</span>}
    </Link>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Assignments" subtitle="Map instructors to their Capability Manager. Reassignment preserves history and prevents orphaned reportees." />

      {/* Tabs (state reflected in the URL ?tab=) */}
      <div className="flex gap-1 border-b border-slate-200">
        <TabLink id="reassign" label="Reassign" />
        <TabLink id="managers" label="Capability Managers" count={managerRows.length} />
      </div>

      {tab === "reassign" ? (
        <MappingManager cms={cmList} instructors={instList} />
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">
            {managerRows.length} capability manager(s)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Capability Manager</th>
                  <th className="px-5 py-3">Reports to</th>
                  <th className="px-5 py-3">Reportees</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managerRows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Users2 className="h-4 w-4" /></span>
                        <span className="font-medium text-slate-800">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{m.reportsTo}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{m.reportees}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/app/instructors?managerId=${m.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                        View reportees <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {managerRows.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">No capability managers.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
