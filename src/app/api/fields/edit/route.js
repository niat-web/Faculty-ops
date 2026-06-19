import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { FieldDefinition } from "@/models/index.js";
import { canEditDirectly, canAccessInstructor } from "@/lib/rbac.js";
import { applyFieldChange, validateValue } from "@/lib/services.js";

export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canEditDirectly(user)) return NextResponse.json({ error: "Not allowed to edit directly" }, { status: 403 });

  const form = await req.formData();
  const instructorId = String(form.get("instructorId"));
  const fieldKey = String(form.get("fieldKey"));
  const fieldLabel = String(form.get("fieldLabel") || "");
  const oldValue = String(form.get("oldValue") || "");
  const newValue = String(form.get("newValue") || "");
  const reason = String(form.get("reason") || "").trim();

  if (!reason) return NextResponse.json({ error: "A reason note is required." }, { status: 400 });
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "Out of scope" }, { status: 403 });

  await connectDB();
  const def = await FieldDefinition.findOne({ key: fieldKey, archivedAt: null,
    $or: [{ scope: "GLOBAL" }, { scope: "INSTANCE", instructorId }] }).lean();
  if (!def) return NextResponse.json({ error: "Unknown field" }, { status: 404 });

  const verr = validateValue(def.type, newValue, { min: def.min, max: def.max, pattern: def.pattern });
  if (verr) return NextResponse.json({ error: verr }, { status: 400 });

  await applyFieldChange({ actor: user, instructorId, fieldKey, fieldLabel, oldValue, newValue, reason,
    sensitive: def.visibility === "SENSITIVE" });
  return NextResponse.json({ ok: true });
}
