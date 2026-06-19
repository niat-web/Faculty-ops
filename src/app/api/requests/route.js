import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { FieldDefinition, EditRequest, Instructor, User } from "@/models/index.js";
import { canSubmitRequests, canAccessInstructor } from "@/lib/rbac.js";
import { saveUpload, notify, validateValue } from "@/lib/services.js";

// Capability Manager submits an edit request (reason + proof).
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canSubmitRequests(user)) return NextResponse.json({ error: "Only Capability Managers submit requests" }, { status: 403 });

  const form = await req.formData();
  const instructorId = String(form.get("instructorId"));
  const fieldKey = String(form.get("fieldKey"));
  const fieldLabel = String(form.get("fieldLabel") || "");
  const oldValue = String(form.get("oldValue") || "");
  const newValue = String(form.get("newValue") || "");
  const reason = String(form.get("reason") || "").trim();
  const proof = form.get("proof");

  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  // PRD §7.4 — a supporting proof document is mandatory.
  if (!proof || typeof proof.arrayBuffer !== "function" || proof.size === 0) {
    return NextResponse.json({ error: "A proof document (image or PDF) is required." }, { status: 400 });
  }
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "That instructor is not your reportee." }, { status: 403 });

  await connectDB();
  const def = await FieldDefinition.findOne({ key: fieldKey, archivedAt: null,
    $or: [{ scope: "GLOBAL" }, { scope: "INSTANCE", instructorId }] }).lean();
  if (!def) return NextResponse.json({ error: "Unknown field" }, { status: 404 });
  const verr = validateValue(def.type, newValue, { min: def.min, max: def.max, pattern: def.pattern });
  if (verr) return NextResponse.json({ error: verr }, { status: 400 });

  const proofPath = await saveUpload(proof, "proof");
  const inst = await Instructor.findById(instructorId).select("name").lean();
  const me = await User.findById(user.id).select("managerId").lean();

  await EditRequest.create({
    instructorId, instructorName: inst?.name, fieldKey, fieldLabel, oldValue, newValue,
    reason, proofPath, status: "PENDING", requesterId: user.id, requesterName: user.name,
    approverId: me?.managerId || null,
  });

  await notify(me?.managerId, {
    type: "EDIT_REQUEST_SUBMITTED",
    title: `New edit request from ${user.name}`,
    body: `${fieldLabel} for ${inst?.name}: ${oldValue || "—"} → ${newValue}`,
    link: "/app/requests",
  });

  return NextResponse.json({ ok: true });
}
