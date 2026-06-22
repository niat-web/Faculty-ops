import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { Instructor, User, AuditLog, LoginEvent, EditRequest, FieldDefinition } from "../models";
import { Role, LifecycleStatus, LIFECYCLE_LABEL } from "../enums";
import { instructorScopeFilter, canAccessInstructor, canEditDirectly, canEditDetails, canDeleteInstructor } from "../lib/rbac";
import { escapeRegex } from "../lib/text";
import { getProfileForViewer } from "../lib/profile";
import { writeAudit, applyFieldChange, validateValue } from "../lib/services";
import { sendInstructorMail, listInstructorMails } from "../lib/instructorMail";
import { maybeDecrypt } from "../lib/crypto";
import { uploadBuffer, downloadStream, deleteFile } from "../lib/storage";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());
const editGuard = (req: any, res: any, next: any) => (canEditDirectly(req.user) ? next() : res.status(403).json({ error: "Forbidden" }));
// Per-instructor detail edits: Ops/SM (anyone) or a Capability Manager — but a CM is limited to
// their OWN reportees via canAccessInstructor (route must carry an :id param).
const detailGuard = async (req: any, res: any, next: any) => {
  if (!canEditDetails(req.user)) return res.status(403).json({ error: "Forbidden" });
  if (!(await canAccessInstructor(req.user, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  next();
};
// Block browser-renderable/executable types (HTML/SVG/XML) as defense-in-depth; downloads already
// force Content-Disposition: attachment. (Bug B3)
const BLOCKED_UPLOAD = new Set(["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/xml", "text/javascript", "application/javascript"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, !BLOCKED_UPLOAD.has(String(file.mimetype || "").toLowerCase())),
});
function uploadFile(req: any, res: any, next: any) {
  upload.single("file")(req, res, (err: any) => (err ? res.status(400).json({ error: err.message || "Upload failed" }) : next()));
}

const EXIT_STATES = ["EXITED", "EXIT_IN_PROGRESS"]; // the lifecycle states the "Active" scope hides
// Non-teaching departments — excluded from the Instructors list page (they stay in Instructor Master).
const NON_INSTRUCTOR_DEPTS = ["Instructors - Delivery Support (Ops and Central managers)", "Product Team"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (e: any) => String(e || "").trim().toLowerCase() || null;
async function emailConflict(email: string, excludeId?: any) {
  return Instructor.findOne({ email, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select("_id").lean();
}

// Shared row shape for the instructor list + exited grid (full master-sheet field set).
function toRow(r: any, mgrName: Record<string, string>) {
  const v = (k: string) => (maybeDecrypt(r.values?.[k] ?? "") || "");
  const pct = r.values?.primary_pct;
  return {
    id: String(r._id), employeeId: r.employeeId, name: r.name, email: r.email || "", campus: r.campus || "", uid: r.uid || "", status: r.status,
    managerId: r.currentManagerId ? String(r.currentManagerId) : "",
    managerName: r.currentManagerId ? mgrName[String(r.currentManagerId)] || null : null,
    training: pct != null && pct !== "" && !isNaN(Number(pct)) ? Number(pct) : null,
    department: v("department"), designation: v("designation"), contribution: v("contribution"),
    contributionRegion: v("contribution_region"), reportingManager: v("reporting_manager"), payroll: v("payroll_entity"),
    phone: v("phone"), universityMail: v("university_mail"), doj: v("doj"), qualification: v("qualification"),
    domain: v("domain"), gender: v("gender"), nativeLanguage: v("native_language"), access: v("access_status"),
    cmEmployeeId: v("cm_employee_id"), remarks: v("remarks"),
    exitDate: r.exit?.lastWorkingDay || v("exit_date"),
    typeOfExit: r.exit?.typeOfExit || "", exitReason: r.exit?.reason || "", exitDetailedReason: r.exit?.detailedReason || "",
  };
}

// Tolerant parser for the messy exit-date strings (dd/mm/yyyy, dd-Mon-yy, ISO, JS date strings).
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseLooseDate(s: string): Date | null {
  if (!s) return null;
  s = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/.exec(s);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
  m = /^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{2,4})$/.exec(s);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo != null) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, mo, +m[1]); } }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Paginated, scoped, filtered instructor list.
router.get("/", async (req, res) => {
  const user = req.user!;
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "").trim();
  const campus = String(req.query.campus || "").trim();
  const department = String(req.query.department || "").trim();
  const managerId = String(req.query.managerId || "").trim();
  const minTraining = parseInt(String(req.query.minTraining || ""), 10);
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const reqPer = parseInt(String(req.query.per || ""), 10);
  const PER = [50, 100, 200, 500].includes(reqPer) ? reqPer : 50;

  // Scope-independent base (everything except the status/scope condition) — used for the bucket counts.
  const scope = String(req.query.scope || "").trim();
  const base: any = { ...instructorScopeFilter(user) };
  if (campus) base.campus = campus;
  // Instructors page = teaching instructors only. A valid (non-excluded) department filter narrows
  // further; otherwise exclude the non-teaching departments (they remain in Instructor Master).
  if (department && !NON_INSTRUCTOR_DEPTS.includes(department)) base["values.department"] = department;
  else base["values.department"] = { $nin: NON_INSTRUCTOR_DEPTS };
  if (managerId) base.currentManagerId = managerId;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); base.$or = [{ name: rx }, { employeeId: rx }, { campus: rx }, { uid: rx }]; }
  if (!isNaN(minTraining)) base.$expr = { $gte: [{ $convert: { input: "$values.primary_pct", to: "int", onError: 0, onNull: 0 } }, minTraining] };

  // A specific status overrides the scope; otherwise "active" excludes (and "exited" shows only) the exit states.
  const filter: any = { ...base };
  if (status) filter.status = status;
  else if (scope === "active") filter.status = { $nin: EXIT_STATES };
  else if (scope === "exited") filter.status = { $in: EXIT_STATES };

  const [total, rows, cAll, cExited] = await Promise.all([
    Instructor.countDocuments(filter),
    Instructor.find(filter).select("employeeId name email campus uid status currentManagerId values exit").sort({ employeeId: 1 }).skip((page - 1) * PER).limit(PER).lean(),
    Instructor.countDocuments(base),
    Instructor.countDocuments({ ...base, status: { $in: EXIT_STATES } }),
  ]);
  const mgrIds = [...new Set(rows.map((r: any) => r.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  res.json({
    total, page, per: PER, pages: Math.max(1, Math.ceil(total / PER)),
    counts: { all: cAll, exited: cExited, active: cAll - cExited },
    instructors: rows.map((r: any) => toRow(r, mgrName)),
  });
});

// ─── Instructor Exited grid — exited only, full filters incl. exit-date range. ──
// The exited set is small (~277), so exit-date filtering is done in JS (string dates are
// inconsistent) over the DB-filtered set, then paginated in memory.
router.get("/exited", async (req, res) => {
  const user = req.user!;
  const q = String(req.query.q || "").trim();
  const department = String(req.query.department || "").trim();
  const managerId = String(req.query.managerId || "").trim();
  const campus = String(req.query.campus || "").trim();
  const region = String(req.query.region || "").trim();
  const payroll = String(req.query.payroll || "").trim();
  const typeOfExit = String(req.query.typeOfExit || "").trim();
  const exitPreset = String(req.query.exitPreset || "").trim(); // last_month | past_3_months | past_6_months | past_year
  const exitFrom = String(req.query.exitFrom || "").trim();      // YYYY-MM-DD
  const exitTo = String(req.query.exitTo || "").trim();          // YYYY-MM-DD
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const reqPer = parseInt(String(req.query.per || ""), 10);
  const PER = [50, 100, 200, 500].includes(reqPer) ? reqPer : 50;

  const filter: any = { ...instructorScopeFilter(user), status: { $in: EXIT_STATES } };
  if (department) filter["values.department"] = department;
  if (managerId) filter.currentManagerId = managerId;
  if (campus) filter.campus = campus;
  if (region) filter["values.contribution_region"] = region;
  if (payroll) filter["values.payroll_entity"] = payroll;
  if (typeOfExit) filter["exit.typeOfExit"] = typeOfExit;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ name: rx }, { employeeId: rx }, { email: rx }, { uid: rx }]; }

  // Facets (from the full exited scope, so options never disappear when filtering).
  const exitScope = { ...instructorScopeFilter(user), status: { $in: EXIT_STATES } };
  const [all, departments, campuses, regions, payrolls, types] = await Promise.all([
    Instructor.find(filter).sort({ employeeId: 1 }).limit(5000).lean(),
    Instructor.distinct("values.department", exitScope),
    Instructor.distinct("campus", exitScope),
    Instructor.distinct("values.contribution_region", exitScope),
    Instructor.distinct("values.payroll_entity", exitScope),
    Instructor.distinct("exit.typeOfExit", exitScope),
  ]);

  // Exit-date window (preset or custom). `from`/`to` are inclusive day bounds.
  let from: Date | null = null, to: Date | null = null;
  const now = new Date();
  if (exitPreset) {
    const days = exitPreset === "last_month" ? 30 : exitPreset === "past_3_months" ? 90 : exitPreset === "past_6_months" ? 180 : exitPreset === "past_year" ? 365 : 0;
    if (days) from = new Date(now.getTime() - days * 86400000);
  }
  if (exitFrom) { const d = parseLooseDate(exitFrom); if (d) from = d; }
  if (exitTo) { const d = parseLooseDate(exitTo); if (d) { d.setHours(23, 59, 59, 999); to = d; } }

  let filtered = all;
  if (from || to) {
    filtered = all.filter((r: any) => {
      const ds = r.exit?.lastWorkingDay || (r.values?.exit_date ? maybeDecrypt(r.values.exit_date) : "");
      const d = parseLooseDate(String(ds || ""));
      if (!d) return false; // no parseable exit date → excluded when a date filter is active
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  const total = filtered.length;
  const slice = filtered.slice((page - 1) * PER, page * PER);
  const mgrIds = [...new Set(slice.map((r: any) => r.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  res.json({
    total, page, per: PER, pages: Math.max(1, Math.ceil(total / PER)),
    instructors: slice.map((r: any) => toRow(r, mgrName)),
    facets: {
      departments: (departments as string[]).filter(Boolean).sort(),
      campuses: (campuses as string[]).filter(Boolean).sort(),
      regions: (regions as string[]).filter(Boolean).sort(),
      payrolls: (payrolls as string[]).filter(Boolean).sort(),
      types: (types as string[]).filter(Boolean).sort(),
    },
  });
});

// Distinct campuses (for filters).
router.get("/campuses", async (req, res) => {
  const list = await Instructor.distinct("campus", instructorScopeFilter(req.user!));
  res.json({ campuses: list.filter(Boolean).sort() });
});

// Distinct departments (for the Instructors-page department filter).
router.get("/departments", async (req, res) => {
  const list = await Instructor.distinct("values.department", instructorScopeFilter(req.user!));
  res.json({ departments: (list as string[]).filter(Boolean).filter((d) => !NON_INSTRUCTOR_DEPTS.includes(d)).sort() });
});

// ─── Inline cell edit for the Instructor Exited grid (Ops/SM). Routes by `kind`. ──
const CELL_CORE = new Set(["name", "email", "campus", "uid"]);
const CELL_EXIT = new Set(["typeOfExit", "reason", "detailedReason", "lastWorkingDay"]);
router.post("/:id/cell", editGuard, async (req, res) => {
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Instructor not found" });
  const kind = String(req.body?.kind || "");
  const key = String(req.body?.key || "");
  const val = req.body?.value == null ? "" : String(req.body.value);
  const audit = (fieldName: string, oldValue: string, newValue: string, action = "FIELD_EDIT") =>
    writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action, fieldName, oldValue, newValue, reason: "Exited grid edit" });

  if (kind === "core") {
    if (!CELL_CORE.has(key)) return res.status(400).json({ error: "Bad field" });
    if (key === "name") { if (!val.trim()) return res.status(400).json({ error: "Name can't be empty." }); const old = inst.name; inst.name = val.trim(); await inst.save(); await audit("Name", old, inst.name); return res.json({ ok: true }); }
    if (key === "email") { const e = normEmail(val); if (e && !EMAIL_RE.test(e)) return res.status(400).json({ error: "Invalid email." }); if (e && (await emailConflict(e, inst._id))) return res.status(409).json({ error: "Another instructor already uses this email." }); const old = inst.email || ""; inst.email = e; await inst.save(); await audit("Mail ID", old, e || ""); return res.json({ ok: true }); }
    const old = (key === "campus" ? inst.campus : inst.uid) || "";
    inst[key] = val.trim() || null; await inst.save(); await audit(key === "campus" ? "Work Location" : "UID", old, val.trim());
    return res.json({ ok: true });
  }
  if (kind === "manager") {
    let newId: any = null, newName = "— unassigned —";
    if (val) { const cm: any = await User.findOne({ _id: val, role: { $in: [Role.CAPABILITY_MANAGER, Role.SENIOR_MANAGER] } }).select("name").lean(); if (!cm) return res.status(400).json({ error: "Pick a valid manager." }); newId = cm._id; newName = cm.name; }
    const oldName = inst.currentManagerId ? (await User.findById(inst.currentManagerId).select("name").lean())?.name || "" : "";
    inst.currentManagerId = newId; await inst.save();
    await audit("Capability Manager", oldName, newName, "MAPPING_CHANGE");
    return res.json({ ok: true });
  }
  if (kind === "exit") {
    if (!CELL_EXIT.has(key)) return res.status(400).json({ error: "Bad exit field" });
    if (!inst.exit) inst.exit = {};
    const old = inst.exit[key] || "";
    inst.exit[key] = val || null; inst.markModified("exit"); await inst.save();
    await audit(`Exit: ${key}`, old, val);
    return res.json({ ok: true });
  }
  if (kind === "value") {
    const def: any = await FieldDefinition.findOne({ key, archivedAt: null, scope: "GLOBAL" }).lean();
    if (!def) return res.status(404).json({ error: "Unknown field" });
    const verr = validateValue(def.type, val, { min: def.min, max: def.max, pattern: def.pattern });
    if (verr) return res.status(400).json({ error: verr });
    await applyFieldChange({ actor: req.user!, instructorId: String(inst._id), fieldKey: key, fieldLabel: def.label, newValue: val, reason: "Exited grid edit", sensitive: def.visibility === "SENSITIVE" });
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "Bad kind" });
});

// Bulk lifecycle status change (Ops/SM).
router.post("/bulk", editGuard, async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.instructorIds) ? req.body.instructorIds : [];
  const status = String(req.body?.status || "");
  const note = String(req.body?.note || "").trim();
  if (!ids.length) return res.status(400).json({ error: "No instructors selected" });
  if (!Object.values(LifecycleStatus).includes(status as any)) return res.status(400).json({ error: "Bad status" });
  // Batched: one updateMany + one insertMany instead of N sequential saves. (Improvement)
  const docs = await Instructor.find({ _id: { $in: ids } }).select("status name").lean();
  const changedDocs = docs.filter((d: any) => d.status !== status);
  if (changedDocs.length) {
    const now = new Date();
    await Instructor.updateMany(
      { _id: { $in: changedDocs.map((d: any) => d._id) } },
      { $set: { status }, $push: { lifecycle: { status, note: note || "Bulk update", actorId: req.user!.id, actorName: req.user!.name, createdAt: now } } }
    );
    await AuditLog.insertMany(changedDocs.map((d: any) => ({
      instructorId: d._id, instructorName: d.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: "LIFECYCLE_CHANGE", fieldName: "Status", oldValue: d.status, newValue: status, reason: note || "Bulk status change", createdAt: now,
    })));
  }
  res.json({ ok: true, changed: changedDocs.length });
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
    const scope = String(req.query.scope || "").trim();
    if (status) baseFilter.status = status;
    else if (scope === "active") baseFilter.status = { $nin: EXIT_STATES };
    else if (scope === "exited") baseFilter.status = { $in: EXIT_STATES };
    if (campus) baseFilter.campus = campus;
    if (managerId) baseFilter.currentManagerId = managerId;
    const dep = String(req.query.department || "").trim();
    if (dep) baseFilter["values.department"] = dep;
    else if (String(req.query.excludeStaff) === "1") baseFilter["values.department"] = { $nin: NON_INSTRUCTOR_DEPTS };
    if (String(req.query.region || "").trim()) baseFilter["values.contribution_region"] = String(req.query.region).trim();
    if (String(req.query.payroll || "").trim()) baseFilter["values.payroll_entity"] = String(req.query.payroll).trim();
    if (String(req.query.typeOfExit || "").trim()) baseFilter["exit.typeOfExit"] = String(req.query.typeOfExit).trim();
    if (q) { const rx = new RegExp(escapeRegex(q), "i"); baseFilter.$or = [{ name: rx }, { employeeId: rx }, { campus: rx }, { uid: rx }]; }
    if (!isNaN(minTraining)) baseFilter.$expr = { $gte: [{ $convert: { input: "$values.primary_pct", to: "int", onError: 0, onNull: 0 } }, minTraining] };
  }
  const rows = await Instructor.find(baseFilter).sort({ employeeId: 1 }).limit(20000).lean(); // cap to bound memory (Improvement)
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
    // Manager assignment by name (preserves history). Surface unresolved names instead of silently ignoring. (Medium bug)
    const mgrRaw = String(row.manager || row.Manager || row["Capability Manager"] || "").trim();
    const mgrName = mgrRaw.toLowerCase();
    if (mgrName) {
      if (cmByName[mgrName]) {
        if (String(inst.currentManagerId || "") !== cmByName[mgrName]) {
          const open = inst.assignments.find((a: any) => !a.endedAt); if (open) open.endedAt = new Date();
          inst.currentManagerId = cmByName[mgrName];
          inst.assignments.push({ managerId: cmByName[mgrName], assignedById: req.user!.id });
        }
      } else {
        errors.push({ row: i + 1, error: `Unknown/inactive manager "${mgrRaw}" — manager not set (other fields saved)` });
      }
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
    if (status === LifecycleStatus.ONBOARDING && old !== LifecycleStatus.ONBOARDING) await onOnboarded(inst, req.user!);
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
router.post("/:id/lifecycle", detailGuard, async (req, res) => {
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
  if (status === LifecycleStatus.ONBOARDING && old !== LifecycleStatus.ONBOARDING) await onOnboarded(inst, req.user!);
  res.json({ ok: true });
});

// When an instructor enters Onboarding, auto-send the welcome + documents emails (each honours its toggle).
async function onOnboarded(inst: any, actor: { id: string; name: string }) {
  try { await sendInstructorMail("ONBOARD", inst, actor); await sendInstructorMail("DOCUMENTS", inst, actor); }
  catch (e: any) { console.error("[mail] onboard send failed:", e?.message); }
}

// Mails menu — list the 3 lifecycle emails + their last status (any staff who can access the instructor).
router.get("/:id/mails", async (req, res) => {
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  res.json({ mails: await listInstructorMails(req.params.id) });
});

// Manually (re)send one lifecycle email (Ops/SM/CM within scope). Honours the admin toggle.
router.post("/:id/mails/:kind/send", async (req, res) => {
  if (!canEditDetails(req.user!)) return res.status(403).json({ error: "Forbidden" });
  if (!(await canAccessInstructor(req.user!, req.params.id))) return res.status(403).json({ error: "Out of scope" });
  const inst: any = await Instructor.findById(req.params.id).lean();
  if (!inst) return res.status(404).json({ error: "Not found" });
  const r = await sendInstructorMail(req.params.kind, inst, req.user!);
  if (!r.ok) return res.status(r.status === "SKIPPED" ? 409 : 400).json({ error: r.reason || "Could not send", status: r.status });
  res.json({ ok: true, status: r.status, to: r.to });
});

// Re-hire (EXITED → REHIRED).
router.post("/:id/rehire", detailGuard, async (req, res) => {
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
router.post("/:id/skills", detailGuard, async (req, res) => {
  const { key, done } = req.body || {};
  if (!key) return res.status(400).json({ error: "key required" });
  const inst: any = await Instructor.findById(req.params.id);
  if (!inst) return res.status(404).json({ error: "Not found" });
  inst.skills.set(key, !!done);
  await inst.save();
  res.json({ ok: true });
});

// Update exit / offboarding (Ops/SM).
router.post("/:id/exit", detailGuard, async (req, res) => {
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
router.post("/:id/documents", detailGuard, uploadFile, async (req, res) => {
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

router.delete("/:id/documents/:docId", detailGuard, async (req, res) => {
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
