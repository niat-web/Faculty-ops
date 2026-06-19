import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, User } from "@/models/index.js";
import { canManageMapping, canEditDirectly, canAccessInstructor } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";
import { LifecycleStatus } from "@/lib/enums.js";

// Bulk reassign manager or change lifecycle status for selected instructors.
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const { action, ids, value } = await req.json();
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "No instructors selected" }, { status: 400 });

  await connectDB();
  let changed = 0;

  if (action === "reassign") {
    if (!canManageMapping(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const mgr = await User.findById(value).select("name role").lean();
    if (!mgr || mgr.role !== "CAPABILITY_MANAGER") return NextResponse.json({ error: "Target must be a Capability Manager" }, { status: 400 });
    for (const id of ids) {
      if (!(await canAccessInstructor(user, id))) continue;
      const inst = await Instructor.findById(id);
      if (!inst || String(inst.currentManagerId) === String(value)) continue;
      const active = inst.assignments.find((a) => !a.endedAt);
      if (active) active.endedAt = new Date();
      inst.assignments.push({ managerId: value, assignedById: user.id });
      inst.currentManagerId = value;
      await inst.save();
      changed++;
      await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: user.id, actorName: user.name,
        actorRole: user.role, action: "MAPPING_CHANGE", fieldName: "Capability Manager", newValue: mgr.name, reason: "Bulk reassignment" });
    }
  } else if (action === "status") {
    if (!canEditDirectly(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!Object.values(LifecycleStatus).includes(value)) return NextResponse.json({ error: "Bad status" }, { status: 400 });
    for (const id of ids) {
      if (!(await canAccessInstructor(user, id))) continue;
      const inst = await Instructor.findById(id);
      if (!inst || inst.status === value) continue;
      const old = inst.status;
      inst.status = value;
      inst.lifecycle.push({ status: value, note: "Bulk status change", actorId: user.id, actorName: user.name });
      await inst.save();
      changed++;
      await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: user.id, actorName: user.name,
        actorRole: user.role, action: "LIFECYCLE_CHANGE", fieldName: "Lifecycle status", oldValue: old, newValue: value, reason: "Bulk change" });
    }
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, changed });
}
