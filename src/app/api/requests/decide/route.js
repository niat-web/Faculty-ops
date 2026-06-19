import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { EditRequest } from "@/models/index.js";
import { canApproveRequests } from "@/lib/rbac.js";
import { applyFieldChange, notify, writeAudit } from "@/lib/services.js";

// Senior Manager approves/rejects a pending request routed to them.
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canApproveRequests(user)) return NextResponse.json({ error: "Only Senior Managers can decide" }, { status: 403 });

  const form = await req.formData();
  const requestId = String(form.get("requestId"));
  const decision = String(form.get("decision"));
  const comment = String(form.get("comment") || "").trim() || null;

  await connectDB();
  const r = await EditRequest.findById(requestId);
  if (!r) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (String(r.approverId) !== user.id) return NextResponse.json({ error: "Not your request to decide" }, { status: 403 });
  if (r.status !== "PENDING") return NextResponse.json({ error: "Already decided" }, { status: 409 });

  if (decision === "APPROVE") {
    await applyFieldChange({
      actor: user, instructorId: String(r.instructorId), fieldKey: r.fieldKey, fieldLabel: r.fieldLabel,
      oldValue: r.oldValue, newValue: r.newValue, reason: r.reason, proofPath: r.proofPath,
    });
    r.status = "APPROVED"; r.decisionComment = comment; r.decidedAt = new Date(); await r.save();
    await notify(String(r.requesterId), {
      type: "EDIT_REQUEST_APPROVED", title: "Your edit request was approved",
      body: `${r.fieldLabel} → ${r.newValue}`, link: `/app/instructors/${r.instructorId}`,
    });
  } else if (decision === "REJECT") {
    r.status = "REJECTED"; r.decisionComment = comment; r.decidedAt = new Date(); await r.save();
    await writeAudit({
      instructorId: r.instructorId, instructorName: r.instructorName, actorId: user.id, actorName: user.name,
      actorRole: user.role, action: "REQUEST_DECISION", fieldName: r.fieldLabel,
      oldValue: r.oldValue, newValue: r.newValue, reason: `Rejected: ${comment || "no comment"}`,
    });
    await notify(String(r.requesterId), {
      type: "EDIT_REQUEST_REJECTED", title: "Your edit request was rejected",
      body: comment || "No comment provided", link: `/app/instructors/${r.instructorId}`,
    });
  } else {
    return NextResponse.json({ error: "Bad decision" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
