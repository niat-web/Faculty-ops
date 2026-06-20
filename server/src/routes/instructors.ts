import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { Instructor, User, AuditLog, LoginEvent, EditRequest, FieldDefinition } from "../models";
import { Role, LifecycleStatus, LIFECYCLE_LABEL } from "../enums";
import { instructorScopeFilter, canAccessInstructor, canEditDirectly, canDeleteInstructor } from "../lib/rbac";
import { escapeRegex } from "../lib/text";
import { getProfileForViewer } from "../lib/profile";
import { writeAudit, applyFieldChange, validateValue } from "../lib/services";
import { maybeDecrypt } from "../lib/crypto";
import { uploadBuffer, downloadStream, deleteFile } from "../lib/storage";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());
const editGuard = (req: any, res: any, next: any) => (canEditDirectly(req.user) ? next() : res.status(403).json({ error: "Forbidden" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (e: any) => String(e || "").trim().toLowerCase() || null;
async function emailConflict(email: string, excludeId?: any) {
  return Instructor.findOne({ email, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select("_id").lean();
}

// Paginated, scoped, filtered instructor list.
router.get("/", async (req, res) => {
  const user = req.user!;
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "").trim();
  const campus = String(req.query.campus || "").trim();
  const managerId = String(req.query.managerId || "").trim();
  const minTraining = parseInt(String(req.query.minTraining || ""), 10);
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const PER = 25;

  const filter: any = { ...instructorScopeFilter(user) };
  if (status) filter.status = status;
  if (campus) filter.campus = campus;
  if (managerId) filter.currentManagerId = managerId;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ name: rx }, { employeeId: rx }, { campus: rx }, { uid: rx }]; }
  if (!isNaN(minTraining)) filter.$expr = { $gte: [{ $convert: { input: "$values.primary_pct", to: "int", onError: 0, onNull: 0 } }, minTraining] };

  const [total, rows] = await Promise.all([
    Instructor.countDocuments(filter),
    Instructor.find(filter).select("employeeId name email campus status currentManagerId values.primary_pct").sort({ employeeId: 1 }).skip((page - 1) * PER).limit(PER).lean(),
  ]);
  const mgrIds = [...new Set(rows.map((r: any) => r.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  res.json({
    total, page, per: PER, pages: Math.max(1, Math.ceil(total / PER)),
    instructors: rows.map((r: any) => ({
      id: String(r._id), employeeId: r.employeeId, name: r.name, email: r.email || "", campus: r.campus, status: r.status,
      managerId: r.currentManagerId ? String(r.currentManagerId) : "",
      managerName: r.currentManagerId ? mgrName[String(r.currentManagerId)] || null : null,
      training: r.values?.primary_pct != null && r.values.primary_pct !== "" && !isNaN(Number(r.values.primary_pct)) ? Number(r.values.primary_pct) : null,
    })),
  });
});

// Distinct campuses (for filters).
router.get("/campuses", async (req, res) => {
  const list = await Instructor.distinct("campus", instructorScopeFilter(req.user!));
  res.json({ campuses: list.filter(Boolean).sort() });
});

// Bulk lifecycle status change (Ops/SM).
router.post("/bulk", editGuard, async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.instructorIds) ? req.body.instructorIds : [];
  const status = String(req.body?.status || "");
  const note = String(req.body?.note || "").trim();
  if (!ids.length) return res.status(400).json({ error: "No instructors selected" });
  if (!Object.values(LifecycleStatus).includes(status as any)) return res.status(400).json({ error: "Bad status" });
  let changed = 0;
  for (const id of ids) {
    const inst: any = await Instructor.findById(id);
    if (!inst || inst.status === status) continue;
    const old = inst.status;
    inst.status = status;
    inst.lifecycle.push({ status, note: note || "Bulk update", actorId: req.user!.id, actorName: req.user!.name });
    await inst.save();
    changed++;
    await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "LIFECYCLE_CHANGE", fieldName: "Status", oldValue: old, newValue: status, reason: note || "Bulk status change" });
  }
  res.json({ ok: true, changed });
});

// CSV export (scoped). Core columns + all non-sensitive global field values. Honors ?ids= for a selected subset.
router.get("/export.csv", async (req, res) => {
  const idsParam = String(req.query.ids || "").trim();
  const baseFilter: any = instructorScopeFilter(req.user!);
  if (idsParam) {
    // Explicit selection wins; ignore other filters.
    baseFilter._id = { $in: idsParam.split(",").map((s) => s.trim()).filter(Boolean) };
  } else {
    // Otherwise mirror the list's filters so the export matches what the user sees.
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const campus = String(req.query.campus || "").trim();
    const managerId = String(req.query.managerId || "").trim();
    const minTraining = parseInt(String(req.query.minTraining || ""), 10);
    if (status) baseFilter.status = status;
    if (campus) baseFilter.campus = campus;
    if (managerId) baseFilter.currentManagerId = managerId;
    if (q) { const rx = new RegExp(escapeRegex(q), "i"); baseFilter.$or = [{ name: rx }, { employeeId: rx }, { campus: rx }, { uid: rx }]; }
    if (!isNaN(minTraining)) baseFilter.$expr = { $gte: [{ $convert: { input: "$values.primary_pct", to: "int", onError: 0, onNull: 0 } }, minTraining] };
  }
  const rows = await Instructor.find(baseFilter).sort({ employeeId: 1 }).lean();
  const defs = await FieldDefinition.find({ archivedAt: null, scope: "GLOBAL", visibility: { $ne: "SENSITIVE" } }).sort({ module: 1, createdAt: 1 }).lean();
  const mgrIds = [...new Set(rows.map((r: any) => r.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));
  const data = rows.map((r: any) => {
    const base: Record<string, any> = { employeeId: r.employeeId, name: r.name, email: r.email || "", campus: r.campus || "", status: r.status, manager: r.currentManagerId ? mgrName[String(r.currentManagerId)] || "" : "" };
    for (const d of defs as any[]) base[d.label] = maybeDecrypt(r.values?.[d.key] ?? "");
    return base;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="instructors.csv"`);
  res.send(Papa.unparse(data));
});

// CSV import (Ops Admin) — upsert by employeeId. Accepts { rows: [...] } parsed client-side.
router.post("/import", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: "No rows to import" });
  const MAX_ROWS = 5000;
  if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Too many rows (${rows.length}). Split the file into batches of ${MAX_ROWS}.` });
  const defs = await FieldDefinition.find({ archivedAt: null, scope: "GLOBAL" }).lean();
  const byLabel = Object.fromEntries((defs as any[]).map((d) => [d.label.toLowerCase(), d]));
  const byKey = Object.fromEntries((defs as any[]).map((d) => [d.key, d]));
  // Capability Managers (resolve by name from a "manager" / "Capability Manager" column).
  const cms = await User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name").lean();
  const cmByName = Object.fromEntries((cms as any[]).map((c) => [String(c.name).trim().toLowerCase(), String(c._id)]));
  // Status normalization: accept enum value, label, or slug (e.g. "Onboarding" → "ONBOARDING").
  const statusByLabel = Object.fromEntries(Object.entries(LIFECYCLE_LABEL).map(([k, v]) => [v.toLowerCase(), k]));
  const normStatus = (raw: any): string | null => {
    const s = String(raw || "").trim(); if (!s) return null;
    const up = s.toUpperCase().replace(/[\s-]+/g, "_");
    if ((LifecycleStatus as any)[up] || Object.values(LifecycleStatus).includes(up as any)) return up;
    return statusByLabel[s.toLowerCase()] || null;
  };
  let created = 0, updated = 0, skipped = 0;
  const errors: { row: number; error: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const employeeId = String(row.employeeId || row.EmployeeId || row["Employee ID"] || "").trim();
    const name = String(row.name || row.Name || "").trim();
    if (!employeeId || !name) { skipped++; errors.push({ row: i + 1, error: "Missing employeeId or name" }); continue; }
    if (row.status && !normStatus(row.status)) { skipped++; errors.push({ row: i + 1, error: `Unknown status "${row.status}"` }); continue; }
    // Validate every mapped field value up front; reject the row if any is invalid.
    let valErr: string | null = null;
    for (const [k, v] of Object.entries(row)) {
      const def = byKey[k] || byLabel[String(k).toLowerCase()];
      if (def && def.visibility !== "SENSITIVE") { const e = validateValue(def.type, v, { min: def.min, max: def.max, pattern: def.pattern }); if (e) { valErr = `${def.label}: ${e}`; break; } }
    }
    if (valErr) { skipped++; errors.push({ row: i + 1, error: valErr }); continue; }
    const email = normEmail(row.email);
    if (email && !EMAIL_RE.test(email)) { skipped++; errors.push({ row: i + 1, error: `Invalid email "${row.email}"` }); continue; }

    const status = normStatus(row.status) || "ONBOARDING";
    let inst: any = await Instructor.findOne({ employeeId });
    const isNew = !inst;
    if (email && await emailConflict(email, inst?._id)) { skipped++; errors.push({ row: i + 1, error: `Email "${email}" already linked to another instructor` }); continue; }
    if (!inst) inst = new Instructor({ employeeId, name, status, lifecycle: [{ status, note: "Imported", actorId: req.user!.id, actorName: req.user!.name }] });
    inst.name = name;
    if (row.email !== undefined) inst.email = email;
    if (row.campus !== undefined) inst.campus = String(row.campus || "").trim() || null;
    if (normStatus(row.status)) inst.status = status;
    // Manager assignment by name (preserves history).
    const mgrName = String(row.manager || row.Manager || row["Capability Manager"] || "").trim().toLowerCase();
    if (mgrName && cmByName[mgrName] && String(inst.currentManagerId || "") !== cmByName[mgrName]) {
      const open = inst.assignments.find((a: any) => !a.endedAt); if (open) open.endedAt = new Date();
      inst.currentManagerId = cmByName[mgrName];
      inst.assignments.push({ managerId: cmByName[mgrName], assignedById: req.user!.id });
    }
    for (const [k, v] of Object.entries(row)) {
      const def = byKey[k] || byLabel[String(k).toLowerCase()];
      if (def && def.visibility !== "SENSITIVE") inst.values.set(def.key, String(v ?? ""));
    }
    await inst.save();
    isNew ? created++ : updated++;
  }
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "INSTRUCTOR_CREATE", fieldName: "CSV import", newValue: `${created} created, ${updated} updated, ${skipped} skipped`, reason: "Bulk import" });
  res.json({ ok: true, created, updated, skipped, errors: errors.slice(0, 50) });
});

// ─── Instructor self-service ("My Stats") ──────────────────────────────────
// Safely resolve the logged-in instructor's own record by email.
// Guards against a blank email and refuses if the email is ambiguous (>1 match).
async function resolveOwnInstructor(req: any, res: any): Promise<any | null> {
  if (req.user.role !== Role.INSTRUCTOR) { res.status(403).json({ error: "Instructors only" }); return null; }
  const email = String(req.user.email || "").trim().toLowerCase();
  if (!email) { res.status(404).json({ error: "Your account has no email to match an instructor profile." }); return null; }
  const matches = await Instructor.find({ email }).select("_id").limit(2).lean();
  if (!matches.length) { res.status(404).json({ error: "No instructor profile is linked to your account. Please contact your admin." }); return null; }
  if (matches.length > 1) { res.status(409).json({ error: "Multiple instructor profiles share your email — contact your admin." }); return null; }
  return matches[0];
}

// The logged-in instructor's own profile.
router.get("/me", async (req, res) => {
  const own = await resolveOwnInstructor(req, res); if (!own) return;
  const profile = await getProfileForViewer(req.user!, String(own._id));
  res.json({ ...profile, instructorId: String(own._id) });
});

// Instructor edits one of their OWN fields (non-sensitive + self-editable only; direct, no approval).
router.post("/me/value", async (req, res) => {
  const own = await resolveOwnInstructor(req, res); if (!own) return;
  const { fieldKey, fieldLabel = "", oldValue = "", newValue = "" } = req.body || {};
  const def: any = await FieldDefinition.findOne({ key: fieldKey, archivedAt: null, $or: [{ scope: "GLOBAL" }, { scope: "INSTANCE", instructorId: own._id }] }).lean();
  if (!def) return res.status(404).json({ error: "Unknown field" });
  if (def.visibility === "SENSITIVE") return res.status(403).json({ error: "You can't edit this field." });
  if (def.selfEditable === false) return res.status(403).json({ error: "This field can't be self-edited. Ask your manager to update it." });
  const verr = validateValue(def.type, newValue, { min: def.min, max: def.max, pattern: def.pattern });
  if (verr) return res.status(400).json({ error: verr });
  await applyFieldChange({ actor: req.user!, instructorId: String(own._id), fieldKey, fieldLabel: fieldLabel || def.label, oldValue, newValue, reason: "Updated by instructor" });
  res.json({ ok: true });
});

// Instructor toggles one of their OWN training skills.
router.post("/me/skills", async (req, res) => {
  const own = await resolveOwnInstructor(req, res); if (!own) return;
  const { key, done } = req.body || {};
  if (!key) return res.status(400).json({ error: "key required" });
  const inst: any = await Instructor.findById(own._id);
  if (!inst) return res.status(404).json({ error: "No instructor profile is linked to your account." });
  inst.skills.set(key, !!done);
  await inst.save();
  res.json({ ok: true });
});

// Single instructor profile (RBAC-filtered).
router.get("/:id", async (req, res) => {
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  const profile = await getProfileForViewer(req.user!, req.params.id);
  if (!profile) return res.status(404).json({ error: "Not found" });
  res.json(profile);
});

// Create an instructor (Ops Admin).
router.post("/", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { employeeId, name, campus = null, managerId = null, status = "ONBOARDING" } = req.body || {};
  const email = normEmail(req.body?.email);
  if (!String(employeeId || "").trim() || !String(name || "").trim()) return res.status(400).json({ error: "Employee ID and name are required" });
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (await Instructor.findOne({ employeeId: String(employeeId).trim() })) return res.status(409).json({ error: "Employee ID already exists" });
  if (email && await emailConflict(email)) return res.status(409).json({ error: "That email is already linked to another instructor." });
  const inst = await Instructor.create({
    employeeId: String(employeeId).trim(), name: String(name).trim(), email, campus, status,
    currentManagerId: managerId || null,
    assignments: managerId ? [{ managerId, assignedById: req.user!.id }] : [],
    lifecycle: [{ status, note: "Created", actorId: req.user!.id, actorName: req.user!.name }],
  });
  await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "INSTRUCTOR_CREATE", newValue: inst.employeeId, reason: "Instructor created" });
  res.json({ ok: true, id: String(inst._id) });
});

// Edit an instructor's core fields (Ops Admin) — name/email/campus directly, status + manager with history.
router.patch("/:id", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  const { name, email, campus, status, managerId } = req.body || {};
  const actor = { instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role };
  const changed: string[] = [];

  if (typeof name === "string" && name.trim() && name.trim() !== inst.name) { inst.name = name.trim(); changed.push("name"); }
  if (email !== undefined) {
    const e = normEmail(email);
    if (e && !EMAIL_RE.test(e)) return res.status(400).json({ error: "Enter a valid email address." });
    if (e !== inst.email) {
      if (e && await emailConflict(e, inst._id)) return res.status(409).json({ error: "That email is already linked to another instructor." });
      inst.email = e; changed.push("email");
    }
  }
  if (campus !== undefined) { const c = String(campus || "").trim() || null; if (c !== inst.campus) { inst.campus = c; changed.push("campus"); } }

  if (status && status !== inst.status) {
    if (!Object.values(LifecycleStatus).includes(status as any)) return res.status(400).json({ error: "Bad status" });
    const old = inst.status; inst.status = status;
    inst.lifecycle.push({ status, note: "Edited", actorId: req.user!.id, actorName: req.user!.name });
    await writeAudit({ ...actor, action: "LIFECYCLE_CHANGE", fieldName: "Status", oldValue: old, newValue: status, reason: "Edited" });
  }

  if (managerId !== undefined) {
    const newMgr = managerId || null;
    const prev = inst.currentManagerId ? String(inst.currentManagerId) : null;
    if (prev !== newMgr) {
      if (newMgr) { const cm = await User.findOne({ _id: newMgr, role: Role.CAPABILITY_MANAGER, active: true }).lean(); if (!cm) return res.status(400).json({ error: "Invalid or inactive Capability Manager" }); }
      const open = inst.assignments.find((a: any) => !a.endedAt); if (open) open.endedAt = new Date();
      inst.currentManagerId = newMgr;
      if (newMgr) inst.assignments.push({ managerId: newMgr, assignedById: req.user!.id });
      await writeAudit({ ...actor, action: "MAPPING_CHANGE", fieldName: "Capability Manager", oldValue: prev || "—", newValue: newMgr || "— unassigned —", reason: "Edited" });
    }
  }

  await inst.save();
  if (changed.length) await writeAudit({ ...actor, instructorName: inst.name, action: "FIELD_EDIT", fieldName: "Instructor details", newValue: changed.join(", "), reason: "Edited" });
  res.json({ ok: true });
});

// Delete an instructor (Ops Admin) — cascades pending requests + cleans up files.
router.delete("/:id", async (req, res) => {
  if (!canDeleteInstructor(req.user!)) return res.status(403).json({ error: "Forbidden" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  // Remove GridFS blobs for this instructor's documents and any request proofs (avoid orphans).
  const reqs = await EditRequest.find({ instructorId: inst._id }).select("proofPath").lean();
  const fileIds = [...(inst.documents || []).map((d: any) => d.path), ...reqs.map((r: any) => r.proofPath)].filter(Boolean);
  await Promise.allSettled(fileIds.map((id: string) => deleteFile(id)));
  await EditRequest.deleteMany({ instructorId: inst._id });
  await Instructor.deleteOne({ _id: inst._id });
  await writeAudit({ instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "INSTRUCTOR_DELETE", oldValue: inst.employeeId, reason: "Instructor deleted" });
  res.json({ ok: true });
});

// Change lifecycle status (Ops/SM).
router.post("/:id/lifecycle", editGuard, async (req, res) => {
  const status = String(req.body?.status || "");
  const note = String(req.body?.note || "").trim();
  if (!Object.values(LifecycleStatus).includes(status as any)) return res.status(400).json({ error: "Bad status" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  const old = inst.status;
  inst.status = status;
  inst.lifecycle.push({ status, note: note || null, actorId: req.user!.id, actorName: req.user!.name });
  await inst.save();
  await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "LIFECYCLE_CHANGE", fieldName: "Status", oldValue: old, newValue: status, reason: note || "Status change" });
  res.json({ ok: true });
});

// Re-hire (EXITED → REHIRED).
router.post("/:id/rehire", editGuard, async (req, res) => {
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  const note = String(req.body?.note || "").trim() || "Re-hired";
  inst.status = LifecycleStatus.REHIRED;
  inst.lifecycle.push({ status: LifecycleStatus.REHIRED, note, actorId: req.user!.id, actorName: req.user!.name });
  await inst.save();
  await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "LIFECYCLE_CHANGE", fieldName: "Status", newValue: "REHIRED", reason: "Re-hired" });
  res.json({ ok: true });
});

// Toggle a training skill (Ops/SM).
router.post("/:id/skills", editGuard, async (req, res) => {
  const { key, done } = req.body || {};
  if (!key) return res.status(400).json({ error: "key required" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  inst.skills.set(key, !!done);
  await inst.save();
  res.json({ ok: true });
});

// Update exit / offboarding (Ops/SM).
router.post("/:id/exit", editGuard, async (req, res) => {
  const { lastWorkingDay, typeOfExit, reason, detailedReason, items } = req.body || {};
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  inst.exit = inst.exit || {};
  if (lastWorkingDay !== undefined) inst.exit.lastWorkingDay = lastWorkingDay || null;
  if (typeOfExit !== undefined) inst.exit.typeOfExit = typeOfExit || null;
  if (reason !== undefined) inst.exit.reason = reason || null;
  if (detailedReason !== undefined) inst.exit.detailedReason = detailedReason || null;
  if (items && typeof items === "object") for (const [k, v] of Object.entries(items)) inst.exit.items.set(k, !!v);
  await inst.save();
  res.json({ ok: true });
});

// Add a note.
router.post("/:id/notes", async (req, res) => {
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Note body required" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  inst.notes.push({ body, authorId: req.user!.id, authorName: req.user!.name });
  await inst.save();
  await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "NOTE_ADD", reason: "Note added" });
  res.json({ ok: true });
});

// Edit a note (author or Ops/SM).
router.patch("/:id/notes/:noteId", async (req, res) => {
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Note body required" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  const note = inst.notes.id(req.params.noteId);
  if (!note) return res.status(404).json({ error: "Note not found" });
  if (!canEditDirectly(req.user!) && String(note.authorId) !== req.user!.id) return res.status(403).json({ error: "You can only edit your own notes." });
  note.body = body;
  await inst.save();
  res.json({ ok: true });
});

// Delete a note (author or Ops/SM).
router.delete("/:id/notes/:noteId", async (req, res) => {
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  const note = inst.notes.id(req.params.noteId);
  if (!note) return res.status(404).json({ error: "Note not found" });
  if (!canEditDirectly(req.user!) && String(note.authorId) !== req.user!.id) return res.status(403).json({ error: "You can only delete your own notes." });
  note.deleteOne();
  await inst.save();
  res.json({ ok: true });
});

// Documents: upload (Ops/SM), download, delete — stored in GridFS.
router.post("/:id/documents", editGuard, upload.single("file"), async (req, res) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  const name = String(req.body?.name || file.originalname || "document").trim();
  const fileId = await uploadBuffer(name, file.mimetype || "application/octet-stream", file.buffer);
  inst.documents.push({ name, path: fileId, uploadedById: req.user!.id, uploadedByName: req.user!.name });
  try { await inst.save(); } catch (e) { await deleteFile(fileId); throw e; } // don't orphan the blob if the save fails
  await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "NOTE_ADD", fieldName: "Document", newValue: name, reason: "Document uploaded" });
  res.json({ ok: true });
});

router.get("/:id/documents/:docId", async (req, res) => {
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  if (req.user!.role !== Role.OPS_ADMIN && req.user!.role !== Role.SENIOR_MANAGER) return res.status(403).json({ error: "Forbidden" });
  const inst: any = await Instructor.findById(req.params.id).lean();
  const doc = inst?.documents?.find((d: any) => String(d._id) === req.params.docId);
  if (!doc) return res.status(404).json({ error: "Not found" });
  const safe = String(doc.name).replace(/[\r\n"]/g, "").replace(/[^\x20-\x7e]/g, "_") || "document";
  res.setHeader("Content-Disposition", `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
  downloadStream(doc.path).on("error", () => res.status(404).end()).pipe(res);
});

router.delete("/:id/documents/:docId", editGuard, async (req, res) => {
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  const doc = inst.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ error: "Not found" });
  await deleteFile(doc.path);
  doc.deleteOne();
  await inst.save();
  res.json({ ok: true });
});

// Per-instructor audit trail (Ops/SM) — full entries with proof links.
router.get("/:id/audit", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN && req.user!.role !== Role.SENIOR_MANAGER) return res.status(403).json({ error: "Forbidden" });
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  const rows = await AuditLog.find({ instructorId: req.params.id }).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ entries: rows.map((a: any) => ({ id: String(a._id), action: a.action, actorName: a.actorName, actorRole: a.actorRole, fieldName: a.fieldName, oldValue: a.oldValue, newValue: a.newValue, reason: a.reason, proofPath: a.proofPath || null, createdAt: a.createdAt })) });
});

// Per-instructor history (manager changes, lifecycle, field changes, logins).
router.get("/:id/history", async (req, res) => {
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  const inst: any = await Instructor.findById(req.params.id).lean();
  if (!inst) return res.status(404).json({ error: "Not found" });
  const privileged = req.user!.role === Role.OPS_ADMIN || req.user!.role === Role.SENIOR_MANAGER;

  // resolve manager names for the assignment timeline
  const mgrIds = [...new Set((inst.assignments || []).map((a: any) => a.managerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  const fieldChanges = privileged ? await AuditLog.find({ instructorId: inst._id, action: { $in: ["FIELD_EDIT", "MAPPING_CHANGE", "LIFECYCLE_CHANGE"] } }).sort({ createdAt: -1 }).limit(100).lean() : [];
  const logins = privileged && inst.email ? await LoginEvent.find({ email: inst.email }).sort({ at: -1 }).limit(50).lean() : [];

  res.json({
    name: inst.name,
    assignments: (inst.assignments || []).map((a: any) => ({ manager: mgrName[String(a.managerId)] || "—", startedAt: a.startedAt, endedAt: a.endedAt })).reverse(),
    lifecycle: (inst.lifecycle || []).map((l: any) => ({ status: l.status, note: l.note, actorName: l.actorName, createdAt: l.createdAt })).reverse(),
    fieldChanges: fieldChanges.map((a: any) => ({ fieldName: a.fieldName, oldValue: a.oldValue, newValue: a.newValue, actorName: a.actorName, reason: a.reason, createdAt: a.createdAt })),
    logins: logins.map((l: any) => ({ method: l.method, ip: l.ip, userAgent: l.userAgent, at: l.at })),
  });
});

export default router;
