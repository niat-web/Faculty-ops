import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { User, Instructor } from "@/models/index.js";
import { canViewAudit } from "@/lib/rbac.js";
import { Role } from "@/lib/enums.js";
import OrgChart from "@/components/OrgChart.js";

export default async function OrgChartPage() {
  const user = await getCurrentUser();
  if (!canViewAudit(user)) redirect("/app"); // SM / Ops only

  await connectDB();
  const [sms, cms, counts, instrTotal] = await Promise.all([
    User.find({ role: Role.SENIOR_MANAGER, active: true }).select("name").sort({ name: 1 }).lean(),
    User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name managerId").sort({ name: 1 }).lean(),
    Instructor.aggregate([{ $group: { _id: "$currentManagerId", n: { $sum: 1 } } }]),
    Instructor.countDocuments(),
  ]);
  const countByCm = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  const cmsByMgr = {};
  for (const cm of cms) {
    const k = cm.managerId ? String(cm.managerId) : "none";
    (cmsByMgr[k] ||= []).push({ id: String(cm._id), name: cm.name, count: countByCm[String(cm._id)] || 0 });
  }

  const data = {
    totalInstructors: instrTotal,
    totalManagers: sms.length + cms.length,
    sms: sms.map((sm) => ({ id: String(sm._id), name: sm.name, cms: cmsByMgr[String(sm._id)] || [] })),
    unassigned: cmsByMgr.none || [],
  };

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100vh-4rem)] flex-col lg:-mx-6 lg:-my-5">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-xl font-bold">Org Chart</h1>
          <p className="text-xs text-slate-500">
            {sms.length} senior managers · {cms.length} capability managers · {instrTotal} instructors.
            Drag to pan · scroll to zoom · click a manager to view reportees.
          </p>
        </div>
        {data.unassigned.length > 0 && (
          <Link href="/app/users" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100">
            <Building2 className="h-3.5 w-3.5" /> {data.unassigned.length} unassigned CM(s) — assign a manager
          </Link>
        )}
      </div>

      <div className="flex flex-1 p-3">
        <OrgChart data={data} />
      </div>
    </div>
  );
}
