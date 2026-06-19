import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor } from "@/models/index.js";
import { canAccessInstructor } from "@/lib/rbac.js";
import { readUpload, isValidRef } from "@/lib/storage.js";

// Serve an instructor document only to users who can access that instructor.
export async function GET(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const sp = new URL(req.url).searchParams;
  const instructorId = sp.get("instructorId") || "";
  const rel = sp.get("path") || "";
  if (!isValidRef(rel)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  if (!(await canAccessInstructor(user, instructorId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Confirm the document actually belongs to that instructor.
  await connectDB();
  const owns = await Instructor.findOne({ _id: instructorId, "documents.path": rel }).select("_id").lean();
  if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = await readUpload(rel);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(file.buffer, { headers: { "Content-Type": file.contentType } });
}
