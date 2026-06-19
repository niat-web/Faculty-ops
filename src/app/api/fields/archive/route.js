import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { FieldDefinition } from "@/models/index.js";
import { canManageSchema } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";

// Soft-delete a field (archive). Mandatory reason; historical values retained.
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageSchema(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const fieldId = String(form.get("fieldId"));
  const reason = String(form.get("reason") || "").trim();
  if (!reason) return NextResponse.json({ error: "A reason is required to archive." }, { status: 400 });

  await connectDB();
  const def = await FieldDefinition.findById(fieldId);
  if (!def) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (def.archivedAt) return NextResponse.json({ error: "Already archived" }, { status: 409 });

  def.archivedAt = new Date();
  def.archiveReason = reason;
  await def.save();

  await writeAudit({
    instructorId: def.instructorId, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "FIELD_ARCHIVE", fieldName: def.label, reason,
  });
  return NextResponse.json({ ok: true });
}
