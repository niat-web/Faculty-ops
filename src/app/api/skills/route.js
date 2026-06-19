import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor } from "@/models/index.js";
import { canEditDirectly, canAccessInstructor } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";

// Toggle a training-track skill for an instructor (Senior Manager / Ops Admin).
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canEditDirectly(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { instructorId, key, label, done } = await req.json();
  if (!instructorId || !key) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "Out of scope" }, { status: 403 });

  await connectDB();
  const inst = await Instructor.findById(instructorId);
  if (done) inst.skills.set(key, true); else inst.skills.delete(key);
  await inst.save();

  await writeAudit({
    instructorId, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "FIELD_EDIT", fieldName: `Skill: ${label || key}`, newValue: done ? "completed" : "not done", reason: "Skill checklist update",
  });
  return NextResponse.json({ ok: true });
}
