import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { canManageUsers } from "@/lib/rbac.js";
import { buildTemplate } from "@/lib/importer.js";

// Download a CSV template matching the current global field schema.
export async function GET(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const csv = await buildTemplate();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="instructor_import_template.csv"`,
    },
  });
}
