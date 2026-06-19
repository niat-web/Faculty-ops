import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { EditRequest } from "@/models/index.js";
import { Role } from "@/lib/enums.js";
import { readUpload, isValidRef } from "@/lib/storage.js";

// Serve proof documents only to authorized users.
export async function GET(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  const rel = new URL(req.url).searchParams.get("path") || "";
  if (!isValidRef(rel)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

  // CMs may only see proofs on requests they raised or must approve.
  if (![Role.OPS_ADMIN, Role.SENIOR_MANAGER].includes(user.role)) {
    await connectDB();
    const owns = await EditRequest.findOne({ proofPath: rel, $or: [{ requesterId: user.id }, { approverId: user.id }] }).select("_id").lean();
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await readUpload(rel);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(file.buffer, { headers: { "Content-Type": file.contentType } });
}
