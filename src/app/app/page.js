import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, EditRequest, AuditLog, User } from "@/models/index.js";
import { instructorScopeFilter } from "@/lib/rbac.js";
import { Role } from "@/lib/enums.js";
import {
  statusBreakdown, campusBreakdown, trainingAverage, trainingBuckets,
  joinsByMonth, upcomingDeadlines,
} from "@/lib/analytics.js";
import AdminDashboard from "@/components/dashboards/AdminDashboard.js";
import SeniorManagerDashboard from "@/components/dashboards/SeniorManagerDashboard.js";
import CapabilityManagerDashboard from "@/components/dashboards/CapabilityManagerDashboard.js";
import InstructorDashboard from "@/components/dashboards/InstructorDashboard.js";

export default async function Dashboard() {
  const user = await getCurrentUser();
  await connectDB();
  const firstName = user.name.split(" ")[0];
  const scope = instructorScopeFilter(user);
  const docs = await Instructor.find(scope)
    .select("name employeeId status campus currentManagerId values createdAt")
    .lean();

  const kpisBase = {
    total: docs.length,
    campuses: new Set(docs.map((d) => d.campus).filter(Boolean)).size,
    avgTraining: trainingAverage(docs),
    exiting: docs.filter((d) => d.status === "EXIT_IN_PROGRESS" || d.status === "EXITED").length,
  };
  const chartsBase = {
    status: statusBreakdown(docs),
    campus: campusBreakdown(docs),
    trainingBuckets: trainingBuckets(docs),
    joins: joinsByMonth(docs),
  };

  // Capability-Manager workload (names) — for Admin & Senior Manager.
  async function workload() {
    const m = {};
    for (const d of docs) if (d.currentManagerId) {
      const k = String(d.currentManagerId);
      m[k] = (m[k] || 0) + 1;
    }
    const ids = Object.keys(m);
    const cms = await User.find({ _id: { $in: ids } }).select("name").lean();
    const nameOf = Object.fromEntries(cms.map((c) => [String(c._id), c.name]));
    return Object.entries(m)
      .map(([id, value]) => ({ name: nameOf[id] || "—", value }))
      .sort((a, b) => b.value - a.value);
  }

  if (user.role === Role.OPS_ADMIN) {
    const recent = (await AuditLog.find().sort({ createdAt: -1 }).limit(6).lean()).map((r) => ({
      id: String(r._id), actorName: r.actorName, action: r.action,
      fieldName: r.fieldName, instructorName: r.instructorName, createdAt: r.createdAt,
    }));
    return <AdminDashboard name={firstName} kpis={kpisBase} charts={{ ...chartsBase, workload: await workload() }} recent={recent} />;
  }

  if (user.role === Role.SENIOR_MANAGER) {
    const pending = await EditRequest.countDocuments({ approverId: user.id, status: "PENDING" });
    return <SeniorManagerDashboard name={firstName} kpis={{ ...kpisBase, pending }} charts={{ ...chartsBase, workload: await workload() }} />;
  }

  if (user.role === Role.CAPABILITY_MANAGER) {
    const pending = await EditRequest.countDocuments({ requesterId: user.id, status: "PENDING" });
    const reporteeProgress = docs
      .map((d) => ({ name: d.name, value: Number(d.values?.primary_pct || 0) }))
      .sort((a, b) => b.value - a.value);
    const deadlines = upcomingDeadlines(docs);
    return (
      <CapabilityManagerDashboard
        name={firstName}
        kpis={{ ...kpisBase, pending }}
        charts={{ status: chartsBase.status, reporteeProgress }}
        deadlines={deadlines}
      />
    );
  }

  // Instructor (self view)
  const self = docs[0];
  let me = null;
  if (self) {
    let manager = null;
    if (self.currentManagerId) {
      const m = await User.findById(self.currentManagerId).select("name").lean();
      manager = m?.name || null;
    }
    me = {
      id: String(self._id), employeeId: self.employeeId, status: self.status, campus: self.campus,
      training: Number(self.values?.primary_pct || 0), review: self.values?.review_score || null,
      track: self.values?.primary_track || null, deadline: self.values?.track_deadline || null, manager,
    };
  }
  return <InstructorDashboard name={firstName} me={me} />;
}
