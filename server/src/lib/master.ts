// Instructor Master — a flat, spreadsheet-style view of every instructor with all the
// "master sheet" columns, inline-editable. Each column maps to either a CORE Instructor
// field, the manager relationship, or a dynamic FieldDefinition value (stored in values).
import { FieldDefinition, MasterColumn } from "../models";
import { DEPARTMENT_OPTS } from "./training";

export type MasterSource = "core" | "manager" | "value";
export type MasterColumnDef = {
  key: string;            // core field name | "managerId" | dynamic field key
  label: string;          // header shown in the grid
  source: MasterSource;
  type: string;           // TEXT | NUMBER | DATE | DROPDOWN | MANAGER
  options?: string[];     // for DROPDOWN
  editable: boolean;
  locked?: boolean;       // essential column — can't be deleted/reordered out
};

// ── Option sets (mirror the master spreadsheet's data-validation dropdowns) ──
const CONTRIBUTION_REGION_OPTS = ["Hindi", "Kannada", "Malayalam", "Marathi", "Central", "Tamil", "Telugu", "Work From Home"];
const PAYROLL_OPTS = ["Nxtwave", "University"];
const GENDER_OPTS = ["Male", "Female"];
const QUALIFICATION_OPTS = ["MA", "MBA", "MCA", "MCom", "MSc", "M.Tech", "PGDM", "PHD", "M.Tech(Integrated)", "BCom", "BCA", "BBA", "B.E", "B.A", "B.Sc", "B.Tech", "B.Ed & B.Sc", "MA Linguistics"];
// Role / Designation — comprehensive list (master sheet validation + existing data). The client also
// prepends any current value that isn't here, so no existing role is ever lost/blanked.
const ROLE_OPTS = [
  "Associate English instructor", "Associate English Instructor- Mentor", "English Instructor", "English Trainer", "Associate English Trainer",
  "Aptitude Instructor", "Associate Aptitude Instructor", "Associate Aptitude Instructor- Mentor", "Senior Aptitude Instructor",
  "Math Instructor", "Associate Math Instructor", "Senior Math Instructor", "Mathematics Instructor", "Associate Mathematics Instructor",
  "Senior Mathematics Instructor", "Mathematics and Statistics instructor", "Math Faculty Trainee", "Physics Instructor",
  "Software development Instructor", "Software development Mentor", "Competitive Programming Trainer",
  "SDI", "SDM", "SDF", "SDFT", "SET", "SET, L&D and IAS", "IAS", "HOD",
  "Program Manager", "Project Manager", "Project manager", "Associate Project Manager", "Mentor",
  "Business Operations Associate", "Business operation associate", "BOA",
  "Hiring", "Hiring Manager", "L&D DSA", "L&D Frontend", "Process Improvement",
  "Training Incharge", "Training Manager", "Training Ops", "Zonal Incharge", "Capability Manager", "Other",
];

// The master grid columns, in spreadsheet order. (Seeds the editable MasterColumn docs on first use.)
export const MASTER_COLUMNS: MasterColumnDef[] = [
  { key: "employeeId", label: "Employee ID", source: "core", type: "TEXT", editable: false, locked: true },
  { key: "name", label: "Name", source: "core", type: "TEXT", editable: true, locked: true },
  { key: "department", label: "Department", source: "value", type: "DROPDOWN", options: DEPARTMENT_OPTS, editable: true },
  { key: "managerId", label: "Capability Manager", source: "manager", type: "MANAGER", editable: true, locked: true },
  { key: "campus", label: "Work Location", source: "core", type: "TEXT", editable: true },
  { key: "contribution", label: "Contribution", source: "value", type: "TEXT", editable: true },
  { key: "hod_interaction", label: "HOD Interaction", source: "value", type: "TEXT", editable: true },
  { key: "contribution_region", label: "Contribution Region", source: "value", type: "DROPDOWN", options: CONTRIBUTION_REGION_OPTS, editable: true },
  { key: "reporting_manager", label: "Reporting Manager (Darwin)", source: "value", type: "TEXT", editable: true },
  { key: "payroll_entity", label: "Payroll", source: "value", type: "DROPDOWN", options: PAYROLL_OPTS, editable: true },
  { key: "designation", label: "Role", source: "value", type: "DROPDOWN", options: ROLE_OPTS, editable: true },
  { key: "phone", label: "Phone Number", source: "value", type: "TEXT", editable: true },
  { key: "email", label: "Mail ID", source: "core", type: "TEXT", editable: true },
  { key: "university_mail", label: "University Mail Id", source: "value", type: "TEXT", editable: true },
  { key: "doj", label: "DOJ", source: "value", type: "DATE", editable: true },
  { key: "qualification", label: "Qualification", source: "value", type: "DROPDOWN", options: QUALIFICATION_OPTS, editable: true },
  { key: "domain", label: "Domain", source: "value", type: "TEXT", editable: true },
  { key: "uid", label: "UID", source: "core", type: "TEXT", editable: true },
  { key: "gender", label: "Gender", source: "value", type: "DROPDOWN", options: GENDER_OPTS, editable: true },
  { key: "native_language", label: "Native Language", source: "value", type: "TEXT", editable: true },
  { key: "access_status", label: "Portal / Assets / Drive Access", source: "value", type: "TEXT", editable: true },
  { key: "cm_employee_id", label: "Capability Manager Employee ID", source: "value", type: "TEXT", editable: true },
  { key: "exit_date", label: "Exit Date", source: "value", type: "TEXT", editable: true },
  { key: "remarks", label: "Remarks", source: "value", type: "TEXT", editable: true },
  { key: "workspace", label: "June 2026 Workspace", source: "value", type: "TEXT", editable: true },
  { key: "emp_state", label: "State", source: "value", type: "TEXT", editable: true },
  { key: "emp_district", label: "District", source: "value", type: "TEXT", editable: true },
  { key: "emp_city", label: "City", source: "value", type: "TEXT", editable: true },
];

// Quick lookups (seed defaults — runtime reads come from the DB via getActiveMasterColumns).
export const MASTER_COLUMN_BY_KEY: Record<string, MasterColumnDef> = Object.fromEntries(MASTER_COLUMNS.map((c) => [c.key, c]));

// Dynamic fields that don't exist yet but the master sheet needs (created on first use).
const NEW_FIELDS: { key: string; label: string; module: string; type: string; visibility: string }[] = [
  { key: "hod_interaction", label: "HOD Interaction", module: "DEPLOYMENT", type: "TEXT", visibility: "PUBLIC" },
  { key: "cm_employee_id", label: "Capability Manager Employee ID", module: "DEPLOYMENT", type: "TEXT", visibility: "NECESSARY" },
  { key: "exit_date", label: "Exit Date", module: "DEPLOYMENT", type: "TEXT", visibility: "NECESSARY" },
];
// Existing TEXT fields the user wants promoted to admin-editable DROPDOWNs (non-destructive: only
// applied while the field is still a non-DROPDOWN — once converted, Ops owns the options in Fields).
const DROPDOWN_FIELDS: { key: string; options: string[] }[] = [
  { key: "designation", options: ROLE_OPTS },
  { key: "payroll_entity", options: PAYROLL_OPTS },
  { key: "gender", options: GENDER_OPTS },
  { key: "contribution_region", options: CONTRIBUTION_REGION_OPTS },
  { key: "department", options: DEPARTMENT_OPTS },
  { key: "qualification", options: QUALIFICATION_OPTS },
];

let _ensured = false;
// Idempotent: create the missing master fields + promote the requested ones to DROPDOWNs.
export async function ensureMasterFields() {
  if (_ensured) return;
  for (const f of NEW_FIELDS) {
    const exists = await FieldDefinition.findOne({ key: f.key, scope: "GLOBAL" }).select("_id").lean();
    if (!exists) await FieldDefinition.create({ ...f, scope: "GLOBAL", options: [], selfEditable: false });
  }
  for (const d of DROPDOWN_FIELDS) {
    await FieldDefinition.updateOne(
      { key: d.key, scope: "GLOBAL", type: { $ne: "DROPDOWN" }, archivedAt: null },
      { $set: { type: "DROPDOWN", options: d.options } }
    );
  }
  _ensured = true;
}

// label → safe field key (for admin-created master columns).
export const keyFromLabel = (label: string) =>
  String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

let _seeded = false;
// Materialise MASTER_COLUMNS into editable MasterColumn docs on first use (idempotent).
export async function seedMasterColumns() {
  if (_seeded) return;
  await ensureMasterFields();
  if ((await MasterColumn.countDocuments()) === 0) {
    await MasterColumn.insertMany(MASTER_COLUMNS.map((c, i) => ({
      key: c.key, label: c.label, source: c.source, type: c.type, options: c.options || [], order: i, locked: !!c.locked,
    })));
  }
  _seeded = true;
}

// Active (non-archived) master columns in display order. `editable` is derived (only Employee ID is read-only).
export async function getActiveMasterColumns(): Promise<any[]> {
  await seedMasterColumns();
  const cols = await MasterColumn.find({ archivedAt: null }).sort({ order: 1 }).lean();
  return (cols as any[]).map((c) => ({
    key: c.key, label: c.label, source: c.source, type: c.type, options: c.options || [],
    locked: !!c.locked, editable: c.key !== "employeeId",
  }));
}
