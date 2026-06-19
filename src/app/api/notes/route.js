import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor } from "@/models/index.js";
import { canAccessInstructor, canEditDirectly, canSubmitRequests } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";

// Add a timestamped note. Anyone who can access the instructor may add notes.
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const form = await req.formData();
  const instructorId = String(form.get("instructorId"));
  const body = String(form.get("body") || "").trim();
  if (!body) return NextResponse.json({ error: "Note is empty" }, { status: 400 });
  if (!(canEditDirectly(user) || canSubmitRequests(user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "Out of scope" }, { status: 403 });

  await connectDB();
  const inst = await Instructor.findById(instructorId);
  inst.notes.push({ body, authorId: user.id, authorName: user.name });
  await inst.save();
  await writeAudit({
    instructorId, instructorName: inst.name, actorId: user.id, actorName: user.name,
    actorRole: user.role, action: "NOTE_ADD", reason: body.slice(0, 120),
  });
  return NextResponse.json({ ok: true });
}
