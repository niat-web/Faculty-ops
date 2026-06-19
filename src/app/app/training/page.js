import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, User } from "@/models/index.js";
import { instructorScopeFilter, canManageUsers } from "@/lib/rbac.js";
import { Role } from "@/lib/enums.js";
import { tabForInstructor } from "@/lib/training.js";
import TrainingStats from "@/components/TrainingStats.js";

// Fields surfaced as read-only context + editable summary columns in the grid.
const CTX_KEYS = [
  "department", "primary_track", "secondary_track", "ongoing_track",
  "ongoing_start", "track_deadline", "primary_pct", "secondary_pct",
  "health_status", "predicted_completion",
];

export default async function TrainingStatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Plain instructors don't get this management grid.
  if (user.role === Role.INSTRUCTOR) redirect("/app");

  await connectDB();
  const scope = instructorScopeFilter(user);
  const docs = await Instructor.find(scope)
    .select("employeeId name currentManagerId values moduleStatus")
    .lean();

  // Manager id -> name (for the Capability Manager column).
  const mgrIds = [...new Set(docs.map((d) => d.currentManagerId).filter(Boolean).map(String))];
  const mgrs = await User.find({ _id: { $in: mgrIds } }).select("name").lean();
  const mgrName = Object.fromEntries(mgrs.map((m) => [String(m._id), m.name]));

  const rows = [];
  for (const d of docs) {
    const values = d.values || {};
    const moduleStatus = d.moduleStatus || {};
    const tab = tabForInstructor(values, moduleStatus);
    if (!tab) continue; // skip non-training staff (Central/Ops/Delivery support)
    const ctx = {};
    for (const k of CTX_KEYS) ctx[k] = values[k] ?? "";
    rows.push({
      id: String(d._id),
      tab,
      employeeId: d.employeeId,
      name: d.name,
      manager: d.currentManagerId ? (mgrName[String(d.currentManagerId)] || "—") : "—",
      ctx,
      moduleStatus,
    });
  }
  rows.sort((a, b) => (a.employeeId || "").localeCompare(b.employeeId || ""));

  return (
    <TrainingStats
      rows={rows}
      canDelete={canManageUsers(user)} // Ops Admin can delete an instructor row
      role={user.role}
    />
  );
}
