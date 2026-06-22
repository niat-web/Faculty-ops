import { Router } from "express";
import Papa from "papaparse";
import { Instructor, User, FieldDefinition, MasterColumn } from "../models";
import { Role } from "../enums";
import { instructorScopeFilter, canAccessInstructor, canEditDetails } from "../lib/rbac";
import { escapeRegex } from "../lib/text";
import { maybeDecrypt } from "../lib/crypto";
import { applyFieldChange, writeAudit, validateValue } from "../lib/services";
import { ensureMasterFields, seedMasterColumns, getActiveMasterColumns, keyFromLabel } from "../lib/master";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());

// Master is a manager/admin view — Ops, SM and CM (CM scoped to own reportees). Instructors blocked.
const guard = (req: any, res: any, next: any) => (canEditDetails(req.user) ? next() : res.status(403).json({ error: "Forbidden" }));
// Column management is Ops-only (changes the grid for everyone).
const opsGuard = (req: any, res: any, next: any) => (req.user?.role === Role.OPS_ADMIN ? next() : res.status(403).json({ error: "Forbidden" }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (e: any) => String(e || "").trim().toLowerCase() || null;
const COL_TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN"];

// Non-teaching departments — excluded when filtering to the Instructor role (kept in sync with instructors.ts).
const NON_INSTRUCTOR_DEPTS = ["Instructors - Delivery Support (Ops and Central managers)", "Product Team"];

// Role filter (from the Roles page): map a role to an `email` Mongo condition. A record's role =
// the role of the User matching its email; "INSTRUCTOR" = any record whose email is NOT a staff user.
async function roleEmailCondition(role: string): Promise<any | null> {
  if (!role) return null;
  if (role === "INSTRUCTOR") {
    const staff = await User.find({ role: { $in: [Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER] } }).select("email").lean();
    return { $nin: (staff as any[]).map((u) => (u.email || "").toLowerCase()).filter(Boolean) };
  }
  const us = await User.find({ role }).select("email").lean();
  return { $in: (us as any[]).map((u) => (u.email || "").toLowerCase()).filter(Boolean) };
}

// Column defs (from the editable MasterColumn docs) + dropdown filter lists + the CM picker list.
router.get("/meta", guard, async (req, res) => {
  const columns = await getActiveMasterColumns();
  const scope = instructorScopeFilter(req.user!);
  const [managers, departments, payrolls, regions, campuses] = await Promise.all([
    User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name").sort({ name: 1 }).lean(),
    Instructor.distinct("values.department", scope),
    Instructor.distinct("values.payroll_entity", scope),
    Instructor.distinct("values.contribution_region", scope),
    Instructor.distinct("campus", scope),
  ]);
  res.json({
    columns,
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

// Filters accept comma-separated values (single or multi) → equality or $in.
const listParam = (v: any) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const inOrEq = (vals: string[]) => (vals.length > 1 ? { $in: vals } : vals[0]);
// 3-state column sort → Mongo sort object. Core fields sort directly; others sort by values.<key>.
const CORE_SORT = new Set(["employeeId", "name", "email", "campus", "uid", "status"]);
function buildSort(sort: string, dir: string): Record<string, 1 | -1> {
  if (!sort || !dir) return { employeeId: 1 };
  const d: 1 | -1 = dir === "desc" ? -1 : 1;
  if (CORE_SORT.has(sort)) return { [sort]: d };
  if (sort === "managerId") return { employeeId: 1 }; // manager-name sort unsupported (join) → default
  return { [`values.${sort}`]: d };
}

// Paginated, scoped, filtered master rows.
router.get("/", guard, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const managers = listParam(req.query.managerId);
  const departments = listParam(req.query.department);
  const payrolls = listParam(req.query.payroll);
  const regions = listParam(req.query.region);
  const campuses = listParam(req.query.campus);
  const scope = String(req.query.scope || "active").trim(); // active | all | exited (default active)
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const reqPer = parseInt(String(req.query.per || ""), 10);
  const PER = [50, 100, 200, 500].includes(reqPer) ? reqPer : 50;

  // base = everything except the lifecycle/scope condition (used for the bucket counts).
  const base: any = { ...instructorScopeFilter(req.user!) };
  if (managers.length) base.currentManagerId = inOrEq(managers);
  if (departments.length) base["values.department"] = inOrEq(departments);
  if (payrolls.length) base["values.payroll_entity"] = inOrEq(payrolls);
  if (regions.length) base["values.contribution_region"] = inOrEq(regions);
  if (campuses.length) base.campus = inOrEq(campuses);
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); base.$or = [{ name: rx }, { employeeId: rx }, { email: rx }, { uid: rx }]; }
  const role = String(req.query.role || "").trim();
  if (role) {
    const cond = await roleEmailCondition(role);
    if (cond) base.email = cond;
    // Instructor role = teaching only → also drop the non-teaching departments (unless a dept filter is set).
    if (role === "INSTRUCTOR" && !departments.length) base["values.department"] = { $nin: NON_INSTRUCTOR_DEPTS };
  }

  const filter: any = { ...base };
  if (scope === "active") filter.status = { $nin: EXIT_STATES };
  else if (scope === "exited") filter.status = { $in: EXIT_STATES };

  const [total, rows, cAll, cExited] = await Promise.all([
    Instructor.countDocuments(filter),
    Instructor.find(filter).sort(buildSort(String(req.query.sort || ""), String(req.query.dir || ""))).skip((page - 1) * PER).limit(PER).lean(),
    Instructor.countDocuments(base),
    Instructor.countDocuments({ ...base, status: { $in: EXIT_STATES } }),
  ]);
  const mgrIds = [...new Set(rows.map((r: any) => r.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  const valueKeys = (await getActiveMasterColumns()).filter((c) => c.source === "value").map((c) => c.key);
  const instructors = rows.map((r: any) => {
    const row: Record<string, any> = {
      id: String(r._id),
      employeeId: r.employeeId, name: r.name, email: r.email || "", campus: r.campus || "", uid: r.uid || "",
      managerId: r.currentManagerId ? String(r.currentManagerId) : "",
      managerName: r.currentManagerId ? mgrName[String(r.currentManagerId)] || "" : "",
    };
    for (const key of valueKeys) row[key] = maybeDecrypt(r.values?.[key] ?? "") ?? "";
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
  const role = String(req.query.role || "").trim();
  if (role) {
    const cond = await roleEmailCondition(role);
    if (cond) filter.email = cond;
    if (role === "INSTRUCTOR" && !req.query.department) filter["values.department"] = { $nin: NON_INSTRUCTOR_DEPTS };
  }
  const scope = String(req.query.scope || "active").trim();
  if (scope === "active") filter.status = { $nin: EXIT_STATES };
  else if (scope === "exited") filter.status = { $in: EXIT_STATES };

  const rows = await Instructor.find(filter).sort({ employeeId: 1 }).limit(20000).lean();
  const mgrIds = [...new Set(rows.map((r: any) => r.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  const cols = await getActiveMasterColumns();
  const data = rows.map((r: any) => {
    const out: Record<string, any> = {};
    for (const c of cols) {
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
  const col = (await getActiveMasterColumns()).find((c) => c.key === String(key));
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

// ─── Admin: manage Instructor Master columns (Ops only) ────────────────────
const colAudit = (req: any, action: string, name: string, val = "") =>
  writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action, fieldName: name, newValue: val, reason: "Master column" });

// All columns (active + hidden) with an in-use count.
router.get("/columns", opsGuard, async (_req, res) => {
  await seedMasterColumns();
  const all = await MasterColumn.find().sort({ order: 1 }).lean();
  const total = await Instructor.estimatedDocumentCount();
  const counts = await Promise.all((all as any[]).map((c) =>
    c.source === "value" ? Instructor.countDocuments({ [`values.${c.key}`]: { $exists: true, $nin: ["", null] } })
      : c.source === "manager" ? Instructor.countDocuments({ currentManagerId: { $ne: null } })
        : Promise.resolve(total)
  ));
  const active: any[] = [], archived: any[] = [];
  (all as any[]).forEach((c, i) => {
    const row = { id: String(c._id), key: c.key, label: c.label, source: c.source, type: c.type, options: c.options || [], locked: !!c.locked, inUse: counts[i] };
    (c.archivedAt ? archived : active).push(row);
  });
  res.json({ columns: active, archived });
});

// Add a new (value-backed) column — surfaces an existing dynamic field or creates one.
router.post("/columns", opsGuard, async (req, res) => {
  await seedMasterColumns();
  const label = String(req.body?.label || "").trim();
  const type = String(req.body?.type || "TEXT").toUpperCase();
  const options = Array.isArray(req.body?.options) ? req.body.options.map((s: any) => String(s).trim()).filter(Boolean) : [];
  if (!label) return res.status(400).json({ error: "Label is required." });
  if (!COL_TYPES.includes(type)) return res.status(400).json({ error: "Unsupported column type." });
  if (type === "DROPDOWN" && !options.length) return res.status(400).json({ error: "Add at least one dropdown option." });
  const key = keyFromLabel(label);
  if (!key) return res.status(400).json({ error: "Label must contain letters or numbers." });
  if (await MasterColumn.findOne({ key, archivedAt: null }).select("_id").lean()) return res.status(409).json({ error: "A column with that name already exists." });

  // Reuse an existing global field of that key, else create one. (No duplicate dynamic fields.)
  const def: any = await FieldDefinition.findOne({ key, scope: "GLOBAL" }).lean();
  if (!def) await FieldDefinition.create({ key, label, module: "DEPLOYMENT", type, visibility: "NECESSARY", scope: "GLOBAL", options, selfEditable: false });
  else if (type === "DROPDOWN" && def.type !== "DROPDOWN") await FieldDefinition.updateOne({ _id: def._id }, { $set: { type, options } });

  const last: any = await MasterColumn.findOne().sort({ order: -1 }).select("order").lean();
  const col = await MasterColumn.create({ key, label, source: "value", type, options, order: (last?.order ?? 0) + 1 });
  await colAudit(req, "FIELD_ADD", `Master column: ${label}`, type);
  res.json({ ok: true, id: String(col._id) });
});

// Edit a column (label always; type/options only for value columns — reflected onto the field).
router.patch("/columns/:id", opsGuard, async (req, res) => {
  const col: any = await MasterColumn.findById(req.params.id);
  if (!col) return res.status(404).json({ error: "Not found" });
  const label = req.body?.label != null ? String(req.body.label).trim() : col.label;
  if (!label) return res.status(400).json({ error: "Label is required." });
  col.label = label;
  if (col.source === "value") {
    if (req.body?.type) { const t = String(req.body.type).toUpperCase(); if (COL_TYPES.includes(t)) col.type = t; }
    if (Array.isArray(req.body?.options)) col.options = req.body.options.map((s: any) => String(s).trim()).filter(Boolean);
    if (col.type === "DROPDOWN" && !col.options.length) return res.status(400).json({ error: "Add at least one dropdown option." });
    // Keep the underlying field in sync so the profile/other screens match this type.
    await FieldDefinition.updateOne({ key: col.key, scope: "GLOBAL" }, { $set: { type: col.type, options: col.options } });
  }
  await col.save();
  await colAudit(req, "FIELD_EDIT", `Master column: ${label}`, col.type);
  res.json({ ok: true });
});

// Hide (soft-archive) a column — values are preserved; essential columns can't be hidden.
router.delete("/columns/:id", opsGuard, async (req, res) => {
  const col: any = await MasterColumn.findById(req.params.id);
  if (!col) return res.status(404).json({ error: "Not found" });
  if (col.locked) return res.status(400).json({ error: "This is an essential column and can't be removed." });
  col.archivedAt = new Date();
  await col.save();
  await colAudit(req, "FIELD_ARCHIVE", `Master column: ${col.label}`, "hidden");
  res.json({ ok: true });
});

router.post("/columns/:id/restore", opsGuard, async (req, res) => {
  const col: any = await MasterColumn.findById(req.params.id);
  if (!col) return res.status(404).json({ error: "Not found" });
  if (await MasterColumn.findOne({ key: col.key, archivedAt: null, _id: { $ne: col._id } }).select("_id").lean())
    return res.status(409).json({ error: "An active column with that key already exists." });
  col.archivedAt = null;
  await col.save();
  res.json({ ok: true });
});

// Persist a new order (array of column ids in display order).
router.post("/columns/reorder", opsGuard, async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
  if (!ids.length) return res.status(400).json({ error: "No order provided." });
  await MasterColumn.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i } } } })));
  res.json({ ok: true });
});

export default router;
