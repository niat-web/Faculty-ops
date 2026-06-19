import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, FieldDefinition } from "@/models/index.js";
import { canAccessInstructor } from "@/lib/rbac.js";
import { Role } from "@/lib/enums.js";
import { writeAudit } from "@/lib/services.js";
import { encrypt } from "@/lib/crypto.js";

// Update a single training-grid cell.
// Allowed: Ops Admin / Senior Manager (any instructor) and Capability Manager
// (only their assigned reportees — enforced by canAccessInstructor scope).
// body: { instructorId, target: "module" | "value", key, value }  (value="" clears)
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const allowed = [Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER];
  if (!allowed.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { instructorId, target, key, value } = await req.json();
  if (!instructorId || !target || !key) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (!["module", "value"].includes(target)) return NextResponse.json({ error: "Bad target" }, { status: 400 });

  // Scope check — a CM may only touch their own reportees.
  if (!(await canAccessInstructor(user, instructorId)))
    return NextResponse.json({ error: "Out of scope" }, { status: 403 });

  await connectDB();
  const inst = await Instructor.findById(instructorId);
  if (!inst) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clean = String(value ?? "").trim();

  if (target === "module") {
    if (clean) inst.moduleStatus.set(key, clean);
    else inst.moduleStatus.delete(key);
    await inst.save();
    await writeAudit({
      instructorId, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role,
      action: "FIELD_EDIT", fieldName: `Module: ${key}`, newValue: clean || "(cleared)", reason: "Training stats update",
    });
    return NextResponse.json({ ok: true });
  }

  // target === "value": must map to a real (non-archived) global field.
  const def = await FieldDefinition.findOne({ key, archivedAt: null }).lean();
  if (!def) return NextResponse.json({ error: "Unknown field" }, { status: 400 });
  const sensitive = def.visibility === "SENSITIVE";
  if (clean) inst.values.set(key, sensitive ? encrypt(clean) : clean);
  else inst.values.delete(key);
  await inst.save();
  await writeAudit({
    instructorId, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "FIELD_EDIT", fieldName: def.label,
    newValue: sensitive ? "••••" : (clean || "(cleared)"), reason: "Training stats update",
  });
  return NextResponse.json({ ok: true });
}
