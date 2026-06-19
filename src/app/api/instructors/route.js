import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, User } from "@/models/index.js";
import { canManageUsers } from "@/lib/rbac.js";
import { writeAudit } from "@/lib/services.js";

// Create a new instructor (Ops Admin).
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const employeeId = String(form.get("employeeId") || "").trim();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim() || null;
  const campus = String(form.get("campus") || "").trim() || null;
  const managerId = form.get("managerId") ? String(form.get("managerId")) : null;
  if (!employeeId || !name) return NextResponse.json({ error: "Employee ID and name are required" }, { status: 400 });

  await connectDB();
  if (await Instructor.findOne({ employeeId })) return NextResponse.json({ error: "Employee ID already exists" }, { status: 409 });

  let mgrName = null;
  if (managerId) { const m = await User.findById(managerId).select("name role").lean(); if (m?.role === "CAPABILITY_MANAGER") mgrName = m.name; }

  const inst = await Instructor.create({
    employeeId, name, email, campus, status: "ONBOARDING",
    currentManagerId: managerId || null,
    assignments: managerId ? [{ managerId, assignedById: user.id }] : [],
    lifecycle: [{ status: "ONBOARDING", note: "Created", actorId: user.id, actorName: user.name }],
  });

  await writeAudit({
    instructorId: inst._id, instructorName: inst.name, actorId: user.id, actorName: user.name,
    actorRole: user.role, action: "INSTRUCTOR_CREATE", reason: "Created via UI", newValue: employeeId,
  });

  return NextResponse.json({ ok: true, id: String(inst._id) });
}
