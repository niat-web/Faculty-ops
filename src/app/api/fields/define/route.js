import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.js";
import { connectDB } from "@/lib/db.js";
import { FieldDefinition, User } from "@/models/index.js";
import { canManageSchema } from "@/lib/rbac.js";
import { writeAudit, notify, keyFromLabel } from "@/lib/services.js";
import { Module, FieldType, Visibility, FieldScope, Role } from "@/lib/enums.js";

export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: "Not authenticated" }, { status: e.status || 401 }); }
  if (!canManageSchema(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const label = String(form.get("label") || "").trim();
  const module = String(form.get("module") || "");
  const type = String(form.get("type") || "");
  const visibility = String(form.get("visibility") || "");
  const scope = String(form.get("scope") || "GLOBAL");
  const instructorId = form.get("instructorId") ? String(form.get("instructorId")) : null;
  const optionsRaw = String(form.get("options") || "").trim();
  const minRaw = form.get("min"), maxRaw = form.get("max");
  const min = minRaw !== null && String(minRaw) !== "" ? Number(minRaw) : null;
  const max = maxRaw !== null && String(maxRaw) !== "" ? Number(maxRaw) : null;
  const pattern = String(form.get("pattern") || "").trim() || null;

  if (!label) return NextResponse.json({ error: "Label required" }, { status: 400 });
  if (!Object.values(Module).includes(module)) return NextResponse.json({ error: "Bad module" }, { status: 400 });
  if (!Object.values(FieldType).includes(type)) return NextResponse.json({ error: "Bad type" }, { status: 400 });
  if (!Object.values(Visibility).includes(visibility)) return NextResponse.json({ error: "Visibility is required" }, { status: 400 });
  if (!Object.values(FieldScope).includes(scope)) return NextResponse.json({ error: "Bad scope" }, { status: 400 });
  if (scope === "INSTANCE" && !instructorId) return NextResponse.json({ error: "Instance scope needs an instructor" }, { status: 400 });

  const options = type === "DROPDOWN" && optionsRaw ? optionsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (pattern) { try { new RegExp(pattern); } catch { return NextResponse.json({ error: "Invalid regex pattern." }, { status: 400 }); } }
  const key = keyFromLabel(label);

  await connectDB();
  try {
    await FieldDefinition.create({
      key, label, module, type, visibility, scope, options,
      min: type === "NUMBER" ? min : null,
      max: type === "NUMBER" ? max : null,
      pattern: type === "TEXT" ? pattern : null,
      instructorId: scope === "INSTANCE" ? instructorId : null, createdById: user.id,
    });
  } catch (e) {
    if (e.code === 11000) return NextResponse.json({ error: "A field with that key already exists in this scope." }, { status: 409 });
    return NextResponse.json({ error: "Could not create field" }, { status: 500 });
  }

  await writeAudit({
    instructorId: scope === "INSTANCE" ? instructorId : null, actorId: user.id, actorName: user.name,
    actorRole: user.role, action: "FIELD_ADD", fieldName: label, newValue: `${type}/${visibility}/${scope}`, reason: "Field added",
  });

  const ops = await User.find({ role: Role.OPS_ADMIN }).select("_id").lean();
  await Promise.all(ops.map((o) => notify(String(o._id), {
    type: "SCHEMA_CHANGED", title: "New field added", body: `${label} (${module}) by ${user.name}`, link: "/app/fields", email: false,
  })));

  return NextResponse.json({ ok: true });
}
