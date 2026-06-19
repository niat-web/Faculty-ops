import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, User } from "@/models/index.js";
import { canManageMapping } from "@/lib/rbac.js";
import { writeAudit, notify } from "@/lib/services.js";

// Reassign one or more instructors to a new Capability Manager.
// Closes the active assignment (preserving history) and opens a new one.
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageMapping(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { instructorIds, toManagerId } = await req.json();
  if (!Array.isArray(instructorIds) || !instructorIds.length || !toManagerId)
    return NextResponse.json({ error: "instructorIds and toManagerId required" }, { status: 400 });

  await connectDB();
  const mgr = await User.findById(toManagerId).select("name role").lean();
  if (!mgr || mgr.role !== "CAPABILITY_MANAGER")
    return NextResponse.json({ error: "Target must be a Capability Manager" }, { status: 400 });

  let moved = 0;
  for (const id of instructorIds) {
    const inst = await Instructor.findById(id);
    if (!inst) continue;
    if (String(inst.currentManagerId) === String(toManagerId)) continue;
    const oldMgr = inst.currentManagerId;

    // close active assignment
    const active = inst.assignments.find((a) => !a.endedAt);
    if (active) active.endedAt = new Date();
    inst.assignments.push({ managerId: toManagerId, assignedById: user.id });
    inst.currentManagerId = toManagerId;
    await inst.save();
    moved++;

    let oldName = "—";
    if (oldMgr) { const o = await User.findById(oldMgr).select("name").lean(); oldName = o?.name || "—"; }
    await writeAudit({
      instructorId: inst._id, instructorName: inst.name, actorId: user.id, actorName: user.name,
      actorRole: user.role, action: "MAPPING_CHANGE", fieldName: "Capability Manager",
      oldValue: oldName, newValue: mgr.name, reason: "Reassignment",
    });
  }

  await notify(toManagerId, {
    type: "REASSIGNED", title: "Reportees assigned to you",
    body: `${moved} instructor(s) are now your reportees.`, link: "/app/instructors", email: false,
  });

  return NextResponse.json({ ok: true, moved });
}
