import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor } from "@/models/index.js";
import { canEditDirectly, canAccessInstructor } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";

// Reactivate an EXITED instructor, preserving full history (PRD §7.8 re-hire).
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canEditDirectly(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { instructorId, note } = await req.json();
  if (!instructorId) return NextResponse.json({ error: "Missing instructor" }, { status: 400 });
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "Out of scope" }, { status: 403 });

  await connectDB();
  const inst = await Instructor.findById(instructorId);
  if (inst.status !== "EXITED") return NextResponse.json({ error: "Only exited instructors can be re-hired" }, { status: 409 });

  const old = inst.status;
  inst.status = "REHIRED";
  inst.lifecycle.push({ status: "REHIRED", note: note || "Re-hired — profile reactivated", actorId: user.id, actorName: user.name });
  await inst.save();

  await writeAudit({
    instructorId, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "LIFECYCLE_CHANGE", fieldName: "Lifecycle status", oldValue: old, newValue: "REHIRED",
    reason: note || "Re-hire",
  });
  return NextResponse.json({ ok: true });
}
