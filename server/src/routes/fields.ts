import { Router } from "express";
import { FieldDefinition, Instructor, User } from "../models";
import { Module, FieldType, Visibility, FieldScope, Role } from "../enums";
import { canManageSchema, canEditDetails, canAccessInstructor } from "../lib/rbac";
import { writeAudit, notify, applyFieldChange, validateValue } from "../lib/services";
import { maybeDecrypt } from "../lib/crypto";
import { keyFromLabel } from "../lib/text";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());
const schemaGuard = (req: any, res: any, next: any) => (canManageSchema(req.user) ? next() : res.status(403).json({ error: "Forbidden" }));
const opsGuard = (req: any, res: any, next: any) => (req.user.role === Role.OPS_ADMIN ? next() : res.status(403).json({ error: "Only the Super Admin can do this" }));

// Page data: definitions + per-key value counts + instructor list (for instance scope).
router.get("/", schemaGuard, async (_req, res) => {
  const [defs, instructors, countAgg] = await Promise.all([
    FieldDefinition.find().sort({ archivedAt: 1, module: 1, createdAt: 1 }).lean(),
    Instructor.find().select("name employeeId").sort({ employeeId: 1 }).lean(),
    Instructor.aggregate([{ $project: { kv: { $objectToArray: { $ifNull: ["$values", {}] } } } }, { $unwind: "$kv" }, { $group: { _id: "$kv.k", n: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(countAgg.map((c: any) => [c._id, c.n]));
  res.json({
    fields: defs.map((f: any) => ({
      id: String(f._id), key: f.key, label: f.label, module: f.module, type: f.type, visibility: f.visibility, scope: f.scope,
      options: f.options || [], min: f.min ?? null, max: f.max ?? null, pattern: f.pattern || null, selfEditable: f.selfEditable !== false,
      instructorName: instructors.find((i: any) => String(i._id) === String(f.instructorId))?.name || null,
      valueCount: counts[f.key] || 0,
      archivedAt: f.archivedAt ? new Date(f.archivedAt).toISOString() : null, archiveReason: f.archiveReason || null,
    })),
    instructors: instructors.map((i: any) => ({ id: String(i._id), name: i.name, employeeId: i.employeeId })),
  });
});

// Define a new field.
router.post("/", schemaGuard, async (req, res) => {
  const { label, module, type, visibility, scope = "GLOBAL", instructorId = null, options = "", min, max, pattern, selfEditable = true } = req.body || {};
  if (!String(label || "").trim()) return res.status(400).json({ error: "Label required" });
  if (!Object.values(Module).includes(module)) return res.status(400).json({ error: "Bad module" });
  if (!Object.values(FieldType).includes(type)) return res.status(400).json({ error: "Bad type" });
  if (!Object.values(Visibility).includes(visibility)) return res.status(400).json({ error: "Visibility is required" });
  if (!Object.values(FieldScope).includes(scope)) return res.status(400).json({ error: "Bad scope" });
  if (scope === "INSTANCE" && !instructorId) return res.status(400).json({ error: "Instance scope needs an instructor" });
  const opts = type === "DROPDOWN" && options ? String(options).split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  if (pattern) { try { new RegExp(pattern); } catch { return res.status(400).json({ error: "Invalid regex pattern." }); } }
  try {
    await FieldDefinition.create({
      key: keyFromLabel(label), label: label.trim(), module, type, visibility, scope, options: opts,
      min: type === "NUMBER" && min !== "" && min != null ? Number(min) : null,
      max: type === "NUMBER" && max !== "" && max != null ? Number(max) : null,
      pattern: type === "TEXT" ? (pattern || null) : null,
      selfEditable: selfEditable !== false,
      instructorId: scope === "INSTANCE" ? instructorId : null, createdById: req.user!.id,
    });
  } catch (e: any) {
    if (e.code === 11000) return res.status(409).json({ error: "A field with that key already exists in this scope." });
    return res.status(500).json({ error: "Could not create field" });
  }
  await writeAudit({ instructorId: scope === "INSTANCE" ? instructorId : null, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_ADD", fieldName: label, newValue: `${type}/${visibility}/${scope}`, reason: "Field added" });
  const ops = await User.find({ role: Role.OPS_ADMIN }).select("_id").lean();
  await Promise.all(ops.map((o: any) => notify(String(o._id), { type: "SCHEMA_CHANGED", title: "New field added", body: `${label} (${module}) by ${req.user!.name}`, link: "/app/fields", email: false })));
  res.json({ ok: true });
});

// Edit a field definition (Ops Admin only).
router.patch("/:id", opsGuard, async (req, res) => {
  const { label, module, type, visibility, options, min, max, pattern, selfEditable } = req.body || {};
  const def: any = await FieldDefinition.findById(req.params.id);
  if (!def) return res.status(404).json({ error: "Field not found" });
  const prevType = def.type;
  if (typeof selfEditable === "boolean") def.selfEditable = selfEditable;
  if (typeof label === "string" && label.trim()) def.label = label.trim();
  if (module) { if (!Object.values(Module).includes(module)) return res.status(400).json({ error: "Bad module" }); def.module = module; }
  if (type) { if (!Object.values(FieldType).includes(type)) return res.status(400).json({ error: "Bad type" }); def.type = type; }
  if (visibility) { if (!Object.values(Visibility).includes(visibility)) return res.status(400).json({ error: "Bad visibility" }); def.visibility = visibility; }
  if (options !== undefined) def.options = def.type === "DROPDOWN" ? String(options || "").split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  if (def.type === "NUMBER") { def.min = min !== undefined && min !== "" && min !== null ? Number(min) : null; def.max = max !== undefined && max !== "" && max !== null ? Number(max) : null; } else { def.min = null; def.max = null; }
  if (def.type === "TEXT" && pattern) { try { new RegExp(pattern); } catch { return res.status(400).json({ error: "Invalid regex pattern." }); } def.pattern = pattern; } else if (pattern !== undefined) def.pattern = null;

  // Changing the type must not strand existing values that are invalid for the new type. (Medium bug)
  if (type && type !== prevType) {
    const scopeFilter = def.scope === "INSTANCE" && def.instructorId ? { _id: def.instructorId } : {};
    const holders = await Instructor.find({ ...scopeFilter, [`values.${def.key}`]: { $exists: true, $nin: [null, ""] } }).select(`values.${def.key}`).lean();
    let bad = 0;
    for (const h of holders as any[]) {
      const val = maybeDecrypt((h.values || {})[def.key]);
      if (val == null || val === "") continue;
      const err = def.type === "DROPDOWN" ? (def.options.includes(String(val)) ? null : "x") : validateValue(def.type, val, { min: def.min, max: def.max, pattern: def.pattern });
      if (err) bad++;
    }
    if (bad) return res.status(400).json({ error: `Can't switch to ${def.type}: ${bad} instructor(s) hold values that aren't valid. Fix or clear them first.` });
  }
  await def.save();
  await writeAudit({ instructorId: def.instructorId || null, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_EDIT", fieldName: def.label, newValue: `${def.type}/${def.visibility}/${def.module}`, reason: "Field definition edited" });
  res.json({ ok: true });
});

// Hard delete (Ops Admin only) — also strips the value off instructors.
router.delete("/:id", opsGuard, async (req, res) => {
  const def: any = await FieldDefinition.findById(req.params.id);
  if (!def) return res.status(404).json({ error: "Field not found" });
  await FieldDefinition.deleteOne({ _id: def._id });
  const filter = def.scope === "INSTANCE" && def.instructorId ? { _id: def.instructorId } : {};
  await Instructor.updateMany(filter, { $unset: { [`values.${def.key}`]: "" } });
  await writeAudit({ instructorId: def.instructorId || null, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_ARCHIVE", fieldName: def.label, oldValue: def.key, reason: "Field permanently deleted" });
  res.json({ ok: true });
});

// Archive (soft delete).
router.post("/:id/archive", schemaGuard, async (req, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "A reason is required." });
  const def: any = await FieldDefinition.findById(req.params.id);
  if (!def) return res.status(404).json({ error: "Field not found" });
  def.archivedAt = new Date(); def.archiveReason = reason; await def.save();
  await writeAudit({ instructorId: def.instructorId || null, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_ARCHIVE", fieldName: def.label, reason });
  res.json({ ok: true });
});

// Edit an instructor's value for a field (direct edit — Ops/SM).
router.post("/value", async (req, res) => {
  if (!canEditDetails(req.user!)) return res.status(403).json({ error: "Not allowed to edit directly" });
  const { instructorId, fieldKey, fieldLabel = "", oldValue = "", newValue = "", reason = "" } = req.body || {};
  if (!String(reason).trim()) return res.status(400).json({ error: "A reason note is required." });
  if (!(await canAccessInstructor(req.user!, instructorId))) return res.status(403).json({ error: "Out of scope" });
  const def: any = await FieldDefinition.findOne({ key: fieldKey, archivedAt: null, $or: [{ scope: "GLOBAL" }, { scope: "INSTANCE", instructorId }] }).lean();
  if (!def) return res.status(404).json({ error: "Unknown field" });
  const verr = validateValue(def.type, newValue, { min: def.min, max: def.max, pattern: def.pattern });
  if (verr) return res.status(400).json({ error: verr });
  // Optimistic concurrency: refuse if the value changed since the client loaded it. (Improvement)
  if (req.body?.oldValue !== undefined) {
    const cur: any = await Instructor.findById(instructorId).select("values").lean();
    const actual = cur ? maybeDecrypt((cur.values || {})[fieldKey]) : null;
    const norm = (v: any) => String(v ?? "").trim();
    if (norm(actual) !== norm(oldValue)) return res.status(409).json({ error: "This value changed since you loaded it — reload and try again." });
  }
  await applyFieldChange({ actor: req.user!, instructorId, fieldKey, fieldLabel, oldValue, newValue, reason, sensitive: def.visibility === "SENSITIVE" });
  res.json({ ok: true });
});

export default router;
