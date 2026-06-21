import { Router } from "express";
import Papa from "papaparse";
import { Instructor, User, FieldDefinition } from "../models";
import { Role } from "../enums";
import { instructorScopeFilter, canAccessInstructor, canEditDetails } from "../lib/rbac";
import { escapeRegex } from "../lib/text";
import { maybeDecrypt } from "../lib/crypto";
import { applyFieldChange, writeAudit, validateValue } from "../lib/services";
import { MASTER_COLUMNS, MASTER_COLUMN_BY_KEY, MASTER_VALUE_KEYS, ensureMasterFields } from "../lib/master";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());

// Master is a manager/admin view — Ops, SM and CM (CM scoped to own reportees). Instructors blocked.
const guard = (req: any, res: any, next: any) => (canEditDetails(req.user) ? next() : res.status(403).json({ error: "Forbidden" }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (e: any) => String(e || "").trim().toLowerCase() || null;

// Column defs + dropdown filter option lists + the Capability Manager picker list.
router.get("/meta", guard, async (req, res) => {
  await ensureMasterFields();
  const scope = instructorScopeFilter(req.user!);
  const [managers, departments, payrolls, regions, campuses] = await Promise.all([
    User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name").sort({ name: 1 }).lean(),
    Instructor.distinct("values.department", scope),
    Instructor.distinct("values.payroll_entity", scope),
    Instructor.distinct("values.contribution_region", scope),
    Instructor.distinct("campus", scope),
  ]);
  res.json({
    columns: MASTER_COLUMNS,
    managers: managers.map((m: any) => ({ id: String(m._id), name: m.name })),
    filters: {
      departments: (departments as string[]).filter(Boolean).sort(),
      payrolls: (payrolls as string[]).filter(Boolean).sort(),
      regions: (regions as string[]).filter(Boolean).sort(),
      campuses: (campuses as string[]).filter(Boolean).sort(),
    },
  });
});

const EXIT_STATES = ["EXITED", "EXIT_IN_PROGRESS"]; // the lifecycle states the "Active" tab hides

// Paginated, scoped, filtered master rows.
router.get("/", guard, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const managerId = String(req.query.managerId || "").trim();
  const department = String(req.query.department || "").trim();
  const payroll = String(req.query.payroll || "").trim();
  const region = String(req.query.region || "").trim();
  const campus = String(req.query.campus || "").trim();
  const scope = String(req.query.scope || "active").trim(); // active | all | exited (default active)
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const reqPer = parseInt(String(req.query.per || ""), 10);
  const PER = [50, 100, 200, 500].includes(reqPer) ? reqPer : 50;

  // base = everything except the lifecycle/scope condition (used for the bucket counts).
  const base: any = { ...instructorScopeFilter(req.user!) };
  if (managerId) base.currentManagerId = managerId;
  if (department) base["values.department"] = department;
  if (payroll) base["values.payroll_entity"] = payroll;
  if (region) base["values.contribution_region"] = region;
  if (campus) base.campus = campus;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); base.$or = [{ name: rx }, { employeeId: rx }, { email: rx }, { uid: rx }]; }

  const filter: any = { ...base };
  if (scope === "active") filter.status = { $nin: EXIT_STATES };
  else if (scope === "exited") filter.status = { $in: EXIT_STATES };

  const [total, rows, cAll, cExited] = await Promise.all([
    Instructor.countDocuments(filter),
    Instructor.find(filter).sort({ employeeId: 1 }).skip((page - 1) * PER).limit(PER).lean(),
    Instructor.countDocuments(base),
    Instructor.countDocuments({ ...base, status: { $in: EXIT_STATES } }),
  ]);
  const mgrIds = [...new Set(rows.map((r: any) => r.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  const instructors = rows.map((r: any) => {
    const row: Record<string, any> = {
      id: String(r._id),
      employeeId: r.employeeId, name: r.name, email: r.email || "", campus: r.campus || "", uid: r.uid || "",
      managerId: r.currentManagerId ? String(r.currentManagerId) : "",
      managerName: r.currentManagerId ? mgrName[String(r.currentManagerId)] || "" : "",
    };
    for (const key of MASTER_VALUE_KEYS) row[key] = maybeDecrypt(r.values?.[key] ?? "") ?? "";
    return row;
  });
  res.json({ total, page, per: PER, pages: Math.max(1, Math.ceil(total / PER)), counts: { all: cAll, active: cAll - cExited, exited: cExited }, instructors });
});

// CSV export — all master columns, mirrors the active list filters (capped to bound memory).
router.get("/export.csv", guard, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const filter: any = { ...instructorScopeFilter(req.user!) };
  if (req.query.managerId) filter.currentManagerId = String(req.query.managerId);
  if (req.query.department) filter["values.department"] = String(req.query.department);
  if (req.query.payroll) filter["values.payroll_entity"] = String(req.query.payroll);
  if (req.query.region) filter["values.contribution_region"] = String(req.query.region);
  if (req.query.campus) filter.campus = String(req.query.campus);
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ name: rx }, { employeeId: rx }, { email: rx }, { uid: rx }]; }
  const scope = String(req.query.scope || "active").trim();
  if (scope === "active") filter.status = { $nin: EXIT_STATES };
  else if (scope === "exited") filter.status = { $in: EXIT_STATES };

  const rows = await Instructor.find(filter).sort({ employeeId: 1 }).limit(20000).lean();
  const mgrIds = [...new Set(rows.map((r: any) => r.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  const data = rows.map((r: any) => {
    const out: Record<string, any> = {};
    for (const c of MASTER_COLUMNS) {
      if (c.source === "core") out[c.label] = c.key === "employeeId" ? r.employeeId : c.key === "name" ? r.name : c.key === "email" ? (r.email || "") : c.key === "campus" ? (r.campus || "") : c.key === "uid" ? (r.uid || "") : "";
      else if (c.source === "manager") out[c.label] = r.currentManagerId ? mgrName[String(r.currentManagerId)] || "" : "";
      else out[c.label] = maybeDecrypt(r.values?.[c.key] ?? "") ?? "";
    }
    return out;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="instructor-master.csv"`);
  res.send(Papa.unparse(data));
});

// Edit a single master cell.
router.post("/cell", guard, async (req, res) => {
  const { instructorId, key, value } = req.body || {};
  const col = MASTER_COLUMN_BY_KEY[String(key)];
  if (!col || !col.editable) return res.status(400).json({ error: "Unknown or read-only column" });
  if (!(await canAccessInstructor(req.user!, instructorId))) return res.status(403).json({ error: "Out of scope" });
  const val = value == null ? "" : String(value);

  // Type validation (DROPDOWN/MANAGER accept free values — existing data varies; DATE/NUMBER are checked).
  if (col.type === "DATE" || col.type === "NUMBER") {
    const verr = validateValue(col.type, val);
    if (verr) return res.status(400).json({ error: verr });
  }

  if (col.source === "value") {
    await ensureMasterFields();
    await applyFieldChange({ actor: req.user!, instructorId, fieldKey: col.key, fieldLabel: col.label, newValue: val, reason: "Master edit" });
    return res.json({ ok: true });
  }

  // Core + manager edits operate on the Instructor doc directly (with audit).
  const inst: any = await Instructor.findById(instructorId);
  if (!inst) return res.status(404).json({ error: "Instructor not found" });

  if (col.source === "manager") {
    let newId: any = null, newName = "— unassigned —";
    if (val) {
      const cm: any = await User.findOne({ _id: val, role: Role.CAPABILITY_MANAGER, active: true }).select("name").lean();
      if (!cm) return res.status(400).json({ error: "Pick an active Capability Manager." });
      newId = cm._id; newName = cm.name;
    }
    const oldName = inst.currentManagerId ? (await User.findById(inst.currentManagerId).select("name").lean())?.name || "" : "";
    inst.currentManagerId = newId;
    await inst.save();
    await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "MAPPING_CHANGE", fieldName: "Capability Manager", oldValue: oldName, newValue: newName, reason: "Master edit" });
    return res.json({ ok: true });
  }

  // Core string fields: name / email / campus / uid.
  if (col.key === "employeeId") return res.status(400).json({ error: "Employee ID can't be changed." });
  let oldValue = "";
  if (col.key === "name") {
    if (!val.trim()) return res.status(400).json({ error: "Name can't be empty." });
    oldValue = inst.name; inst.name = val.trim();
  } else if (col.key === "email") {
    const e = normEmail(val);
    if (e && !EMAIL_RE.test(e)) return res.status(400).json({ error: "Invalid email." });
    if (e) { const dup = await Instructor.findOne({ email: e, _id: { $ne: inst._id } }).select("_id").lean(); if (dup) return res.status(409).json({ error: "Another instructor already uses this email." }); }
    oldValue = inst.email || ""; inst.email = e;
  } else if (col.key === "campus") {
    oldValue = inst.campus || ""; inst.campus = val.trim() || null;
  } else if (col.key === "uid") {
    oldValue = inst.uid || ""; inst.uid = val.trim() || null;
  } else {
    return res.status(400).json({ error: "Unsupported column" });
  }
  await inst.save();
  await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_EDIT", fieldName: col.label, oldValue, newValue: val, reason: "Master edit" });
  res.json({ ok: true });
});

export default router;
