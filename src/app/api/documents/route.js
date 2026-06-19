import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor } from "@/models/index.js";
import { canEditDirectly, canAccessInstructor } from "@/lib/rbac.js";
import { saveUpload, writeAudit } from "@/lib/services.js";

// Upload a document (certificate, ID proof, etc.) to an instructor profile.
// Senior Manager / Ops Admin only.
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canEditDirectly(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const instructorId = String(form.get("instructorId"));
  const name = String(form.get("name") || "").trim();
  const file = form.get("file");
  if (!instructorId || !file || typeof file.arrayBuffer !== "function") return NextResponse.json({ error: "File required" }, { status: 400 });
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "Out of scope" }, { status: 403 });

  const path = await saveUpload(file, "doc");
  if (!path) return NextResponse.json({ error: "Empty file" }, { status: 400 });

  await connectDB();
  const inst = await Instructor.findById(instructorId);
  inst.documents.push({ name: name || file.name, path, uploadedById: user.id, uploadedByName: user.name });
  await inst.save();

  await writeAudit({
    instructorId, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role,
    action: "NOTE_ADD", fieldName: "Document", newValue: name || file.name, reason: "Document uploaded",
  });
  return NextResponse.json({ ok: true });
}
