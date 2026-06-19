import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, EditRequest } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";

// Delete an instructor (Ops Admin only). Removes the record + any pending
// edit requests, and writes an audit entry recording who deleted whom.
export async function DELETE(req, { params }) {
  let me;
  try { me = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(me)) return NextResponse.json({ error: "Only Ops Admins can delete instructors" }, { status: 403 });

  await connectDB();
  const inst = await Instructor.findById(params.id);
  if (!inst) return NextResponse.json({ error: "Instructor not found" }, { status: 404 });

  const name = inst.name, employeeId = inst.employeeId;
  await EditRequest.deleteMany({ instructorId: inst._id, status: "PENDING" });
  await Instructor.deleteOne({ _id: inst._id });

  await writeAudit({
    actorId: me.id, actorName: me.name, actorRole: me.role, action: "INSTRUCTOR_CREATE",
    fieldName: "Instructor deleted", oldValue: `${name} (${employeeId})`, reason: "Deleted by Ops Admin",
  });
  return NextResponse.json({ ok: true });
}
