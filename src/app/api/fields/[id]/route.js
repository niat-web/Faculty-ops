import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { FieldDefinition, Instructor } from "@/models/index.js";
import { writeAudit } from "@/lib/services.js";
import { Module, FieldType, Visibility, Role } from "@/lib/enums.js";

// Update a field definition (label / module / type / visibility / options /
// validation). Ops Admin only. The machine `key` is left unchanged so existing
// stored values stay attached.
export async function PATCH(req, { params }) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (user.role !== Role.OPS_ADMIN) return NextResponse.json({ error: "Only the Super Admin can edit fields" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { label, module, type, visibility, options, min, max, pattern } = body;

  await connectDB();
  const def = await FieldDefinition.findById(params.id);
  if (!def) return NextResponse.json({ error: "Field not found" }, { status: 404 });

  if (typeof label === "string" && label.trim()) def.label = label.trim();
  if (module) {
    if (!Object.values(Module).includes(module)) return NextResponse.json({ error: "Bad module" }, { status: 400 });
    def.module = module;
  }
  if (type) {
    if (!Object.values(FieldType).includes(type)) return NextResponse.json({ error: "Bad type" }, { status: 400 });
    def.type = type;
  }
  if (visibility) {
    if (!Object.values(Visibility).includes(visibility)) return NextResponse.json({ error: "Bad visibility" }, { status: 400 });
    def.visibility = visibility;
  }
  if (options !== undefined) {
    def.options = def.type === "DROPDOWN"
      ? String(options || "").split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  }
  if (def.type === "NUMBER") {
    def.min = min !== undefined && min !== "" && min !== null ? Number(min) : null;
    def.max = max !== undefined && max !== "" && max !== null ? Number(max) : null;
  } else { def.min = null; def.max = null; }
  if (def.type === "TEXT" && pattern) {
    try { new RegExp(pattern); } catch { return NextResponse.json({ error: "Invalid regex pattern." }, { status: 400 }); }
    def.pattern = pattern;
  } else if (pattern !== undefined) { def.pattern = null; }

  await def.save();
  await writeAudit({
    instructorId: def.instructorId || null, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "FIELD_EDIT", fieldName: def.label, newValue: `${def.type}/${def.visibility}/${def.module}`, reason: "Field definition edited",
  });
  return NextResponse.json({ ok: true });
}

// Hard-delete a field definition (Ops Admin only). Also removes the stored value
// for this key from every instructor so no orphaned data lingers.
export async function DELETE(req, { params }) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (user.role !== Role.OPS_ADMIN) return NextResponse.json({ error: "Only the Super Admin can delete fields" }, { status: 403 });

  await connectDB();
  const def = await FieldDefinition.findById(params.id);
  if (!def) return NextResponse.json({ error: "Field not found" }, { status: 404 });

  const key = def.key;
  await FieldDefinition.deleteOne({ _id: def._id });
  // Strip the value from instructors (scope-aware).
  const filter = def.scope === "INSTANCE" && def.instructorId ? { _id: def.instructorId } : {};
  await Instructor.updateMany(filter, { $unset: { [`values.${key}`]: "" } });

  await writeAudit({
    instructorId: def.instructorId || null, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "FIELD_ARCHIVE", fieldName: def.label, oldValue: key, reason: "Field permanently deleted",
  });
  return NextResponse.json({ ok: true });
}
