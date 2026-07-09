import { Router } from "express";
import Papa from "papaparse";
import { Instructor, User, FieldDefinition, MasterColumn } from "../models";
import { Role } from "../enums";
import { instructorScopeFilter, canAccessInstructor, canEditDetails } from "../lib/rbac";
import { escapeRegex } from "../lib/text";
import { maybeDecrypt } from "../lib/crypto";
import { applyFieldChange, writeAudit, validateValue } from "../lib/services";
import { ensureMasterFields, seedMasterColumns, getActiveMasterColumns, keyFromLabel } from "../lib/master";
import { loadLiveMasterRows, isDefaultUnchecked } from "../lib/masterLive";
import { isOpsDept, isInstructorDept, seniorManagerIdSet, cmDarwinboxEmployeeId } from "../lib/staffRoles";
import { getMasterDepartments, getMasterPayrollVisibility } from "../lib/settings";
import { norm } from "../lib/darwinboxSync";
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

// Non-teaching departments — excluded when filtering to the Instructor role (kept in sync with
// instructors.ts + masterLive.ts). Substring match: robust to Darwinbox's "(NWD_…)" suffix + en-dash.
const NON_INSTRUCTOR_DEPT_RE = /delivery support|instructor platform/i;

// The dynamic "Contribution" field key (resolved by label, e.g. "contribution") — for drill-down
// from the Contribution page. Mirrors contribField() in contribution.ts.
async function contribKey(): Promise<string | null> {
  const f: any = await FieldDefinition.findOne({ label: { $regex: /^contribution$/i }, archivedAt: null }).select("key").lean();
  return f?.key || null;
}

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
  const managers = await User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name").sort({ name: 1 }).lean();
  // Filter dropdown values come from the SAME live rows the grid shows (Darwinbox + Mongo union), so
  // every option is a REAL value present in the sheet — not a stale Mongo-only distinct.
  const live = await loadLiveMasterRows();
  const rows: any[] = live.ok ? live.rows : [];
  const uniq = (key: string) => [...new Set(rows.map((r) => String(r[key] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  // Reporting managers as shown in the grid — from the live rows (Darwinbox + Mongo union), keyed by
  // their NW employee-id code. This is what the Capability Manager filter uses (rmid), so it actually works.
  const rmMap = new Map<string, string>();
  for (const r of rows) {
    const raw = String(r.reporting_manager || "").trim();
    const id = (raw.match(/\((NW[^)]+)\)/i) || [])[1] || "";
    if (!id || rmMap.has(id)) continue;
    rmMap.set(id, raw.replace(/\s*\(NW[^)]*\)\s*$/i, "").trim() || raw);
  }
  const reportingManagers = [...rmMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  res.json({
    columns,
    managers: managers.map((m: any) => ({ id: String(m._id), name: m.name })),
    reportingManagers,
    filters: {
      departments: uniq("department"),
      roles: uniq("designation"),
      payrolls: uniq("payroll_entity"),
      regions: uniq("contribution_region"),
      campuses: uniq("campus"),
      qualifications: uniq("qualification"),
      genders: uniq("gender"),
      domains: uniq("domain"),
      states: uniq("emp_state"),
      workspaces: uniq("workspace"),
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

// Paginated, scoped, filtered master rows — LIVE from Darwinbox (instructor departments), joined with
// MongoDB manual columns by Employee ID. Darwinbox columns are read-only; manual columns are editable.
router.get("/", guard, async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const departments = listParam(req.query.department);
  const payrolls = listParam(req.query.payroll);
  const regions = listParam(req.query.region);
  const contributions = listParam(req.query.contribution);
  const rmids = listParam(req.query.rmid); // Darwinbox reporting-manager employee-id (CM Distribution drill-down)
  // Fallback for an Org-chart CM that has NO resolved Employee ID: filter by the reporting-manager NAME.
  const rmNameFilter = String(req.query.rmnameFilter || "").trim();
  const stripRmName = (s: any) => String(s || "").replace(/\s*\(NW[^)]*\)\s*$/i, "").replace(/\s+/g, " ").trim();
  const designations = listParam(req.query.designation);
  const qualifications = listParam(req.query.qualification);
  const genders = listParam(req.query.gender);
  const domains = listParam(req.query.domain);
  const states = listParam(req.query.state);
  const workspaces = listParam(req.query.workspace);
  const scope = String(req.query.scope || "active").trim(); // active | all | exited (default active)
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const reqPer = parseInt(String(req.query.per || ""), 10);
  const PER = [50, 100, 200, 500, 1000].includes(reqPer) ? reqPer : 50;

  const live = await loadLiveMasterRows(String(req.query.refresh || "") === "1");
  if (!live.ok) return res.status(502).json({ error: live.error, instructors: [], total: 0, page, per: PER, pages: 1, counts: { all: 0, active: 0, exited: 0 }, departments: [], defaultUnchecked: [] });

  // Departments unchecked BY DEFAULT: an Ops Admin's explicit list (Settings → Operations) wins; when
  // they've never configured one, fall back to the built-in non-teaching-support default. Matched by
  // normalised exact name against the live department set.
  const deptCfg = await getMasterDepartments();
  const hiddenSet = new Set(deptCfg.hidden.map((d) => norm(d)));
  const isDeptDefaultUnchecked = (dept: string) => deptCfg.configured ? hiddenSet.has(norm(dept)) : isDefaultUnchecked(dept);

  // Payroll visibility (Ops-controlled global default): hide Nxtwave and/or University rows from the grid.
  // Rows with a blank/other payroll are always shown. The Instructor-Moved page ignores this entirely.
  const payVis = await getMasterPayrollVisibility();
  const payrollAllowed = (r: any) => {
    const p = norm(r.payroll_entity);
    if (p === "nxtwave") return payVis.nxtwave;
    if (p === "university") return payVis.university;
    return true;
  };

  // Department quick-filter: ?depts=<comma list> = show ONLY these departments (exact). When the param
  // is ABSENT, default-exclude whichever departments are marked unchecked-by-default (above).
  const deptParamPresent = req.query.depts != null;
  const deptInclude = new Set(listParam(req.query.depts).map((d) => norm(d)));
  const deptAllowed = (dept: string) => deptParamPresent ? deptInclude.has(norm(dept)) : !isDeptDefaultUnchecked(dept);

  // Role deep-link from the Roles page — overrides the default department gate so support depts show:
  //  OPS_ADMIN → Delivery Support dept · INSTRUCTOR → every other instructor dept · SENIOR_MANAGER → curated list.
  const roleFilter = String(req.query.role || "").trim();
  const smIdSet = roleFilter === "SENIOR_MANAGER" ? await seniorManagerIdSet() : null;
  const roleAllowed = (r: any) => {
    if (roleFilter === "OPS_ADMIN") return isOpsDept(r.department);
    if (roleFilter === "INSTRUCTOR") return isInstructorDept(r.department);
    if (roleFilter === "SENIOR_MANAGER") return smIdSet!.has(norm(r.employeeId));
    return true;
  };

  // RBAC scope: a Capability Manager sees ONLY the instructors who report to them in Darwinbox
  // (reporting_manager_employee_id === their own Employee ID). Ops Admin & Senior Manager see everyone.
  // If we can't resolve the CM's Darwinbox id (email not in Darwinbox), they see no rows (fail closed).
  let cmScopeId: string | null | undefined; // undefined = not a CM (no scoping)
  if (req.user!.role === Role.CAPABILITY_MANAGER) cmScopeId = await cmDarwinboxEmployeeId(req.user!);
  const inScopeForUser = (r: any) => cmScopeId === undefined ? true : (!!cmScopeId && norm(r.reporting_manager_employee_id) === norm(cmScopeId));

  // In-memory filters (data is from Darwinbox, not a Mongo query).
  const has = (arr: string[], v: any) => arr.some((x) => norm(x) === norm(v));
  const matchesNonScope = (r: any) => {
    if (!inScopeForUser(r)) return false;
    if (!payrollAllowed(r)) return false;
    if (roleFilter ? !roleAllowed(r) : !deptAllowed(r.department)) return false;
    if (departments.length && !has(departments, r.department)) return false;
    if (payrolls.length && !has(payrolls, r.payroll_entity)) return false;
    if (regions.length && !has(regions, r.contribution_region)) return false;
    if (contributions.length && !has(contributions, r.contribution)) return false;
    if (rmids.length && !has(rmids, r.reporting_manager_employee_id)) return false;
    if (rmNameFilter && norm(stripRmName(r.reporting_manager)) !== norm(stripRmName(rmNameFilter))) return false;
    if (designations.length && !has(designations, r.designation)) return false;
    if (qualifications.length && !has(qualifications, r.qualification)) return false;
    if (genders.length && !has(genders, r.gender)) return false;
    if (domains.length && !has(domains, r.domain)) return false;
    if (states.length && !has(states, r.emp_state)) return false;
    if (workspaces.length && !has(workspaces, r.workspace)) return false;
    if (q) {
      const hay = `${r.name} ${r.employeeId} ${r.email} ${r.uid}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  // Tab counts reflect the current department/filters (so unchecking a dept updates them), but not scope.
  const filteredAll = live.rows.filter(matchesNonScope);
  const cExited = filteredAll.filter((r) => r.exited).length;
  const counts = { all: filteredAll.length, active: filteredAll.length - cExited, exited: cExited };

  let rows = filteredAll.filter((r) => (scope === "active" ? !r.exited : scope === "exited" ? r.exited : true));

  // Sort (default: Employee ID). Core + value keys sort on the row field directly.
  const sortKey = String(req.query.sort || "").trim() || "employeeId";
  const dir = String(req.query.dir || "").trim() === "desc" ? -1 : 1;
  rows.sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true }) * dir);

  const total = rows.length;
  const instructors = rows.slice((page - 1) * PER, (page - 1) * PER + PER);
  // Training % comes straight from Mongo (values.primary_pct via masterLive) — kept fresh by the
  // hourly BigQuery → Mongo persist (lib/trainingSync.ts). No BigQuery call on a Master page load.
  res.json({
    total, page, per: PER, pages: Math.max(1, Math.ceil(total / PER)),
    counts, instructors, darwinboxKeys: live.darwinboxKeys, fetchedAt: live.fetchedAt,
    departments: live.departments,
    defaultUnchecked: live.departments.filter(isDeptDefaultUnchecked),
  });
});

// University names for the "Payroll → University" picker (staff can read; Ops manages the list in Settings).
router.get("/universities", guard, async (_req, res) => {
  const { getUniversities } = await import("../lib/settings");
  res.json({ universities: await getUniversities() });
});

// Master payroll-visibility control (Ops-only) — which payroll entities the grid shows.
router.get("/payroll-visibility", async (req, res) => {
  const v = await getMasterPayrollVisibility();
  res.json({ payrollVisibility: v });
});
router.patch("/payroll-visibility", opsGuard, async (req, res) => {
  const { setMasterPayrollVisibility } = await import("../lib/settings");
  const b = req.body || {};
  // Never allow BOTH hidden (that would empty the payroll-typed rows entirely) — keep at least one on.
  const next = { nxtwave: b.nxtwave, university: b.university };
  if (next.nxtwave === false && next.university === false) return res.status(400).json({ error: "Show at least one payroll type." });
  const v = await setMasterPayrollVisibility(next);
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "SETTINGS_CHANGE", fieldName: "Master payroll visibility", newValue: `Nxtwave:${v.nxtwave ? "on" : "off"} · University:${v.university ? "on" : "off"}`, reason: "Master payroll visibility" });
  res.json({ payrollVisibility: v });
});

// Instructor Moved — everyone whose Payroll = University (moved to a University payroll entity), regardless
// of how it was set. ALWAYS shows all University-payroll people (ignores the grid's payroll-visibility control),
// but still respects a Capability Manager's reportee scope. Read from the live Master set (Mongo mirror).
router.get("/moved", guard, async (req, res) => {
  const live = await loadLiveMasterRows(false);
  if (!live.ok) return res.status(502).json({ error: live.error, items: [] });

  // CM scoping (same rule as the main grid): a CM sees only their own reportees.
  let cmScopeId: string | null | undefined;
  if (req.user!.role === Role.CAPABILITY_MANAGER) cmScopeId = await cmDarwinboxEmployeeId(req.user!);
  const inScope = (r: any) => cmScopeId === undefined ? true : (!!cmScopeId && norm(r.reporting_manager_employee_id) === norm(cmScopeId));

  // (Admin-removed people are already excluded by loadLiveMasterRows.)
  const q = String(req.query.q || "").trim().toLowerCase();
  const stripRmName = (s: any) => String(s || "").replace(/\s*\(NW[^)]*\)\s*$/i, "").replace(/\s+/g, " ").trim();
  const items = live.rows
    .filter((r: any) => norm(r.payroll_entity) === "university" && inScope(r))
    .filter((r: any) => !q || `${r.name} ${r.employeeId} ${r.workspace} ${r.email}`.toLowerCase().includes(q))
    .map((r: any) => ({
      id: r.id || null,
      employeeId: r.employeeId,
      name: r.name || "",
      university: r.workspace || "",       // the university/campus captured when moved
      campus: r.campus || "",
      department: r.department || "",
      manager: stripRmName(r.reporting_manager) || "",
      exited: !!r.exited,
    }))
    .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  res.json({ items, total: items.length });
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
  if (req.query.contribution) { const ck = await contribKey(); if (ck) filter[`values.${ck}`] = String(req.query.contribution); }
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ name: rx }, { employeeId: rx }, { email: rx }, { uid: rx }]; }
  const role = String(req.query.role || "").trim();
  if (role) {
    const cond = await roleEmailCondition(role);
    if (cond) filter.email = cond;
    if (role === "INSTRUCTOR" && !req.query.department) filter["values.department"] = { $not: NON_INSTRUCTOR_DEPT_RE };
  }
  const scope = String(req.query.scope || "active").trim();
  if (scope === "active") filter.status = { $nin: EXIT_STATES };
  else if (scope === "exited") filter.status = { $in: EXIT_STATES };

  const allRows = await Instructor.find(filter).sort({ employeeId: 1 }).limit(20000).lean();
  // Exclude admin-hidden (removed) people — the export must match what the grid shows.
  const { removedEmployeeIdSet } = await import("../lib/removed");
  const removedSet = await removedEmployeeIdSet();
  const rows = removedSet.size ? (allRows as any[]).filter((r) => !removedSet.has(norm(r.employeeId))) : allRows;
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

// Master value keys that are sourced LIVE from Darwinbox → read-only in this live-join view.
const DARWINBOX_READONLY_KEYS = new Set<string>([
  "employeeId", "name", "email", "campus", "uid", // core Darwinbox-owned
  "phone", "doj", "department", "designation", "reporting_manager", "reporting_manager_employee_id",
  "qualification", "gender", "native_language", "workspace", "emp_state", "emp_district", "emp_city", "exit_date",
]);

// Edit a single master cell. Only the manually-editable FacultyOps columns can be changed here (the rest
// come live from Darwinbox and are read-only). If the row exists only in Darwinbox (no Mongo record yet),
// the first manual edit auto-creates a minimal Instructor keyed by Employee ID.
router.post("/cell", guard, async (req, res) => {
  let { instructorId } = req.body || {};
  const { key, value, employeeId: bodyEmpId, name: bodyName } = req.body || {};
  const col = (await getActiveMasterColumns()).find((c) => c.key === String(key));
  if (!col) return res.status(400).json({ error: "Unknown column" });
  // In the live view, Darwinbox-owned columns are read-only (Darwinbox is the source of truth).
  if (DARWINBOX_READONLY_KEYS.has(col.key)) return res.status(400).json({ error: "This column is synced from Darwinbox and can't be edited here." });
  if (!col.editable) return res.status(400).json({ error: "Read-only column" });
  const val = value == null ? "" : String(value);

  // Type validation (DROPDOWN accepts free values — existing data varies; DATE/NUMBER are checked).
  if (col.type === "DATE" || col.type === "NUMBER") {
    const verr = validateValue(col.type, val);
    if (verr) return res.status(400).json({ error: verr });
  }

  // Auto-create a minimal Mongo record for a Darwinbox-only row on its first manual edit.
  if (!instructorId) {
    const empId = String(bodyEmpId || "").trim();
    if (!empId) return res.status(400).json({ error: "Employee ID is required to save this row." });
    const existing: any = await Instructor.findOne({ employeeId: empId }).select("_id").lean();
    if (existing) instructorId = String(existing._id);
    else {
      const inst = await Instructor.create({
        employeeId: empId, name: String(bodyName || empId).trim(), status: "ONBOARDING",
        lifecycle: [{ status: "ONBOARDING", note: "Created via Master edit (Darwinbox row)", actorId: req.user!.id, actorName: req.user!.name }],
      });
      instructorId = String(inst._id);
      await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "INSTRUCTOR_CREATE", newValue: empId, reason: "Master edit" });
    }
  }
  if (!(await canAccessInstructor(req.user!, instructorId))) return res.status(403).json({ error: "Out of scope" });

  if (col.source === "value") {
    await ensureMasterFields();
    await applyFieldChange({ actor: req.user!, instructorId, fieldKey: col.key, fieldLabel: col.label, newValue: val, reason: "Master edit" });
    return res.json({ ok: true, instructorId });
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

  // Employee ID — Ops Admin only; must be non-empty and unique.
  if (col.key === "employeeId") {
    if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Only an Ops Admin can change the Employee ID." });
    const v = val.trim();
    if (!v) return res.status(400).json({ error: "Employee ID can't be empty." });
    const dup = await Instructor.findOne({ employeeId: v, _id: { $ne: inst._id } }).select("_id").lean();
    if (dup) return res.status(409).json({ error: "Another instructor already uses that Employee ID." });
    const old = inst.employeeId; inst.employeeId = v; await inst.save();
    await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_EDIT", fieldName: "Employee ID", oldValue: old, newValue: v, reason: "Master edit" });
    return res.json({ ok: true });
  }
  // Core string fields: name / email / campus / uid.
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

// ─── Move to University payroll (ATOMIC) ────────────────────────────────────────────────────────────
// Sets Payroll = University AND Workspace = <university> in ONE request, so the two can never diverge.
// (The old client flow POSTed /cell twice; the 2nd write — key "workspace" — was rejected by the Darwinbox
// read-only guard, leaving payroll=University with the university name lost. Bug 1.1.) Mirrors the
// exit-alert "University payroll" outcome (exitAlerts.ts), which also writes both fields together.
router.post("/move-university", guard, async (req, res) => {
  let { instructorId } = req.body || {};
  const employeeId = String(req.body?.employeeId || "").trim();
  const name = String(req.body?.name || "").trim();
  const university = String(req.body?.university || "").trim();
  if (!university) return res.status(400).json({ error: "Pick the university / campus name." });

  // Auto-create a minimal Mongo record for a Darwinbox-only row (same pattern as /cell).
  if (!instructorId) {
    if (!employeeId) return res.status(400).json({ error: "Employee ID is required to save this row." });
    const existing: any = await Instructor.findOne({ employeeId }).select("_id").lean();
    if (existing) instructorId = String(existing._id);
    else {
      const created = await Instructor.create({
        employeeId, name: name || employeeId, status: "ONBOARDING",
        lifecycle: [{ status: "ONBOARDING", note: "Created via Master edit (Darwinbox row)", actorId: req.user!.id, actorName: req.user!.name }],
      });
      instructorId = String(created._id);
      await writeAudit({ instructorId: created._id, instructorName: created.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "INSTRUCTOR_CREATE", newValue: employeeId, reason: "Master edit" });
    }
  }
  if (!(await canAccessInstructor(req.user!, instructorId))) return res.status(403).json({ error: "Out of scope" });

  // Both writes go through applyFieldChange (audited). payroll_entity is a managed FacultyOps column;
  // workspace is written here directly (bypassing the /cell Darwinbox read-only guard) as part of the move.
  await ensureMasterFields();
  await applyFieldChange({ actor: req.user!, instructorId, fieldKey: "payroll_entity", fieldLabel: "Payroll", newValue: "University", reason: "Moved to University payroll" });
  await applyFieldChange({ actor: req.user!, instructorId, fieldKey: "workspace", fieldLabel: "University / Campus", newValue: university, reason: "Moved to University payroll" });
  res.json({ ok: true, instructorId });
});

// ─── Bulk edit: set common fields across many selected instructors at once ──
// Identity / contact columns are intentionally NOT bulk-editable (these are per-person and would be
// nonsensical to set in bulk). Everything else editable is allowed (Work Location, Contribution, Dept,
// Capability Manager, Payroll, Role, …). Applies directly with audit — same mechanism as inline cell edits.
const BULK_DENY = new Set(["employeeId", "name", "email", "uid", "phone", "university_mail"]);

async function applyBulkCell(user: any, col: any, instructorId: string, val: string) {
  if (col.source === "value") {
    await applyFieldChange({ actor: user, instructorId, fieldKey: col.key, fieldLabel: col.label, newValue: val, reason: "Bulk edit" });
    return;
  }
  const inst: any = await Instructor.findById(instructorId);
  if (!inst) throw Object.assign(new Error("Instructor not found"), { status: 404 });
  if (col.source === "manager") {
    let newId: any = null, newName = "— unassigned —";
    if (val) { const cm: any = await User.findById(val).select("name").lean(); if (cm) { newId = cm._id; newName = cm.name; } }
    const oldName = inst.currentManagerId ? (await User.findById(inst.currentManagerId).select("name").lean())?.name || "" : "";
    inst.currentManagerId = newId; await inst.save();
    await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role, action: "MAPPING_CHANGE", fieldName: "Capability Manager", oldValue: oldName, newValue: newName, reason: "Bulk edit" });
    return;
  }
  if (col.key === "campus") {
    const oldValue = inst.campus || ""; inst.campus = val.trim() || null; await inst.save();
    await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: user.id, actorName: user.name, actorRole: user.role, action: "FIELD_EDIT", fieldName: col.label, oldValue, newValue: val, reason: "Bulk edit" });
    return;
  }
  throw Object.assign(new Error(`Unsupported bulk column: ${col.label}`), { status: 400 });
}

router.post("/bulk", guard, async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const changes: { key: string; value: string }[] = Array.isArray(req.body?.changes) ? req.body.changes : [];
  if (!ids.length) return res.status(400).json({ error: "No instructors selected." });
  if (!changes.length) return res.status(400).json({ error: "Pick at least one field to update." });

  const cols = await getActiveMasterColumns();
  // Validate every requested column up front so a bad field fails fast (before touching any instructor).
  const ops: { col: any; value: string }[] = [];
  for (const ch of changes) {
    const col = cols.find((c) => c.key === String(ch.key));
    if (!col) return res.status(400).json({ error: `Unknown column: ${ch.key}` });
    if (!col.editable || BULK_DENY.has(col.key)) return res.status(400).json({ error: `“${col.label}” can't be bulk-edited.` });
    const val = ch.value == null ? "" : String(ch.value);
    if (col.type === "DATE" || col.type === "NUMBER") { const verr = validateValue(col.type, val); if (verr) return res.status(400).json({ error: `${col.label}: ${verr}` }); }
    if (col.source === "manager" && val) {
      const cm: any = await User.findOne({ _id: val, role: Role.CAPABILITY_MANAGER, active: true }).select("_id").lean();
      if (!cm) return res.status(400).json({ error: "Pick an active Capability Manager." });
    }
    ops.push({ col, value: val });
  }
  await ensureMasterFields();

  let updated = 0;
  const errors: { id: string; error: string }[] = [];
  for (const id of ids) {
    if (!(await canAccessInstructor(req.user!, id))) { errors.push({ id, error: "Out of scope" }); continue; }
    try {
      for (const { col, value } of ops) await applyBulkCell(req.user!, col, id, value);
      updated++;
    } catch (e: any) { errors.push({ id, error: e?.message || "Failed" }); }
  }
  res.json({ ok: true, updated, failed: errors.length, fields: ops.length, errors: errors.slice(0, 20) });
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
