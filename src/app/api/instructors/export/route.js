import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { Instructor, FieldDefinition, User } from "@/models/index.js";
import { instructorScopeFilter, filterVisibleFields } from "@/lib/rbac.js";
import { maybeDecrypt } from "@/lib/crypto.js";

// Export scoped instructors to CSV, including only fields the viewer may see.
export async function GET(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }

  await connectDB();
  const idsParam = (new URL(req.url).searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const where = { $and: [instructorScopeFilter(user)] };
  if (idsParam.length) where.$and.push({ _id: { $in: idsParam } });
  const list = await Instructor.find(where).lean();
  const defs = filterVisibleFields(user, await FieldDefinition.find({ archivedAt: null, scope: "GLOBAL" }).sort({ module: 1 }).lean());
  const mgrs = await User.find({ role: "CAPABILITY_MANAGER" }).select("name").lean();
  const mgrMap = Object.fromEntries(mgrs.map((m) => [String(m._id), m.name]));

  const base = ["Employee ID", "Name", "Email", "Campus", "Status", "Capability Manager"];
  const headers = [...base, ...defs.map((d) => d.label)];

  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = list.map((i) => {
    const cells = [
      i.employeeId, i.name, i.email || "", i.campus || "", i.status,
      mgrMap[String(i.currentManagerId)] || "",
      ...defs.map((d) => maybeDecrypt((i.values || {})[d.key]) ?? ""),
    ];
    return cells.map(esc).join(",");
  });

  const csv = [headers.map(esc).join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="instructors.csv"`,
    },
  });
}
