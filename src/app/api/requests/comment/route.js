import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { EditRequest } from "@/models/index.js";
import { notify } from "@/lib/services.js";

// Add a comment to an edit request (only the requester or the approver).
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const { requestId, body } = await req.json();
  const text = String(body || "").trim();
  if (!requestId || !text) return NextResponse.json({ error: "Comment is empty" }, { status: 400 });

  await connectDB();
  const r = await EditRequest.findById(requestId);
  if (!r) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const isParty = String(r.requesterId) === user.id || String(r.approverId) === user.id;
  if (!isParty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  r.comments.push({ body: text, authorId: user.id, authorName: user.name });
  await r.save();

  // Notify the other party.
  const other = String(r.requesterId) === user.id ? r.approverId : r.requesterId;
  notify(String(other), {
    type: "EDIT_REQUEST_SUBMITTED",
    title: `New comment from ${user.name}`,
    body: text.slice(0, 120),
    link: "/app/requests",
    email: false,
  });

  return NextResponse.json({ ok: true });
}
