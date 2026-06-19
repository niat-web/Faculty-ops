import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { canManageUsers } from "@/lib/rbac.js";
import { analyzeCsv, applyImport } from "@/lib/importer.js";

// POST a CSV file. ?mode=preview validates only; ?mode=commit writes. Ops Admin only.
export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageUsers(user)) return NextResponse.json({ error: "Only Ops Admins can import" }, { status: 403 });

  const mode = new URL(req.url).searchParams.get("mode") || "preview";
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file.text !== "function") return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const text = await file.text();
  if (!text.trim()) return NextResponse.json({ error: "File is empty" }, { status: 400 });

  try {
    if (mode === "commit") {
      const result = await applyImport(text, user);
      return NextResponse.json({ ok: true, ...result });
    }
    const analysis = await analyzeCsv(text);
    // Trim row payloads for the wire (keep only what the UI shows).
    return NextResponse.json({
      ok: true,
      headers: analysis.headers,
      unknownColumns: analysis.unknownColumns,
      summary: analysis.summary,
      rows: analysis.rows.map((r) => ({
        rowNum: r.rowNum, employeeId: r.employeeId, name: r.name,
        action: r.action, errors: r.errors, warnings: r.warnings,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
