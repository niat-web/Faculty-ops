import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { AuditLog } from "@/models/index.js";
import { canViewAudit } from "@/lib/rbac.js";
import { escapeRegex } from "@/lib/text.js";

export async function GET(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canViewAudit(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim();
  const action = (sp.get("action") || "").trim();
  const filter = {};
  if (q) { const rx = escapeRegex(q); filter.$or = [
    { actorName: { $regex: rx, $options: "i" } },
    { instructorName: { $regex: rx, $options: "i" } },
    { fieldName: { $regex: rx, $options: "i" } },
  ]; }
  if (action) filter.action = action;

  const entries = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const headers = ["When", "Who", "Role", "Action", "Instructor", "Field", "Old Value", "New Value", "Reason"];
  const rows = entries.map((e) => [
    new Date(e.createdAt).toISOString(), e.actorName, e.actorRole, e.action,
    e.instructorName || "", e.fieldName || "", e.oldValue ?? "", e.newValue ?? "", e.reason || "",
  ].map(esc).join(","));
  const csv = [headers.map(esc).join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit_log.csv"` },
  });
}
