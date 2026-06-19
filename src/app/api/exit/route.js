import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor } from "@/models/index.js";
import { canEditDirectly, canAccessInstructor } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";

// Update an instructor's exit / offboarding checklist (Senior Manager / Ops Admin).
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canEditDirectly(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { instructorId, lastWorkingDay, typeOfExit, reason, detailedReason, items } = body;
  if (!instructorId) return NextResponse.json({ error: "Missing instructor" }, { status: 400 });
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "Out of scope" }, { status: 403 });

  await connectDB();
  const inst = await Instructor.findById(instructorId);
  inst.exit = inst.exit || {};
  inst.exit.lastWorkingDay = lastWorkingDay ?? inst.exit.lastWorkingDay ?? null;
  inst.exit.typeOfExit = typeOfExit ?? inst.exit.typeOfExit ?? null;
  inst.exit.reason = reason ?? inst.exit.reason ?? null;
  inst.exit.detailedReason = detailedReason ?? inst.exit.detailedReason ?? null;
  if (items && typeof items === "object") {
    for (const [k, v] of Object.entries(items)) inst.exit.items.set(k, Boolean(v));
  }
  await inst.save();

  await writeAudit({
    instructorId, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "LIFECYCLE_CHANGE", fieldName: "Exit checklist", reason: "Offboarding update",
  });
  return NextResponse.json({ ok: true });
}
