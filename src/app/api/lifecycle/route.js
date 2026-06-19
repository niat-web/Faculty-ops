import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor } from "@/models/index.js";
import { canEditDirectly, canAccessInstructor } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";
import { LifecycleStatus } from "@/lib/enums.js";

// Change lifecycle status (Senior Manager / Ops Admin). History preserved.
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canEditDirectly(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const instructorId = String(form.get("instructorId"));
  const status = String(form.get("status"));
  const note = String(form.get("note") || "").trim();
  if (!Object.values(LifecycleStatus).includes(status)) return NextResponse.json({ error: "Bad status" }, { status: 400 });
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "Out of scope" }, { status: 403 });

  await connectDB();
  const inst = await Instructor.findById(instructorId);
  const old = inst.status;
  inst.status = status;
  inst.lifecycle.push({ status, note, actorId: user.id, actorName: user.name });
  await inst.save();
  await writeAudit({
    instructorId, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "LIFECYCLE_CHANGE", fieldName: "Lifecycle status", oldValue: old, newValue: status, reason: note || null,
  });
  return NextResponse.json({ ok: true });
}
