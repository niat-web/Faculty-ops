import { Instructor, FieldDefinition, AuditLog } from "../models";
import { getDarwinboxData } from "./darwinbox";
import { ensureMasterFields } from "./master";
import { DEPARTMENT_OPTS } from "./training";
import { maybeDecrypt, encrypt, isEncrypted } from "./crypto";
import type { SessionUser } from "./rbac";

// Darwinbox → Instructor Master sync (per the HR mail thread):
//  - Employee ID is the unique match key.
//  - ONLY instructor-department employees are synced — Darwinbox holds the whole org, we filter by department.
//  - Darwinbox wins on synced fields; FacultyOps-managed fields (CM mapping, contribution, payroll_entity,
//    university_mail, remarks, access, workspace, …) are NEVER touched.
//  - Unknown employees are created; "exited" employment status transitions the instructor to EXITED.
//  - Empty Darwinbox values never blank out existing FacultyOps data.

export const clean = (v: any) => String(v ?? "").trim();
export const norm = (s: any) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// ---- Department filter (sync only OUR people, not the whole org) -----------------------------
// Kept when the Darwinbox department matches one of our instructor departments (normalized) or
// simply contains "instructor". DARWINBOX_DEPARTMENTS env (comma-separated) overrides the list.
const DEPT_OVERRIDE = (process.env.DARWINBOX_DEPARTMENTS || "").split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_DEPTS = new Set((DEPT_OVERRIDE.length ? DEPT_OVERRIDE : DEPARTMENT_OPTS).map(norm));
export function isOurDepartment(dept: string): boolean {
  const n = norm(dept);
  if (!n) return false;
  if (ALLOWED_DEPTS.has(n)) return true;
  return !DEPT_OVERRIDE.length && n.includes("instructor");
}

// ---- Field mapping ----------------------------------------------------------------------------
// Real Darwinbox keys are unknown until the credentials go live, so each target lists candidate
// key names and we resolve against the actual columns at sync time (same trick as the BigQuery lib).
export type Target = { key: string; label: string; kind: "core" | "value"; candidates: string[]; date?: boolean };
export const TARGETS: Target[] = [
  { key: "name", label: "Name", kind: "core", candidates: ["full_name", "employee_name", "name", "display_name"] },
  { key: "email", label: "Mail ID", kind: "core", candidates: ["org_email_id", "official_email_id", "official_email", "company_email_id", "company_email", "email_id", "work_email", "email"] },
  { key: "campus", label: "Work Location", kind: "core", candidates: ["work_location", "office_location", "base_location", "campus", "location", "office_city"] },
  { key: "phone", label: "Phone Number", kind: "value", candidates: ["primary_mobile_number", "mobile_number", "mobile_no", "mobile", "phone_number", "phone", "contact_number", "contact_no"] },
  { key: "doj", label: "DOJ", kind: "value", date: true, candidates: ["date_of_joining", "doj", "joining_date", "date_of_join"] },
  { key: "department", label: "Department", kind: "value", candidates: ["department", "department_name", "dept"] },
  { key: "designation", label: "Role", kind: "value", candidates: ["designation", "designation_name", "job_title", "role", "title"] },
  { key: "reporting_manager", label: "Reporting Manager (Darwin)", kind: "value", candidates: ["direct_manager", "reporting_manager", "reporting_manager_name", "direct_manager_name", "manager_name", "reporting_to"] },
  { key: "qualification", label: "Qualification", kind: "value", candidates: ["highest_educational_qualification", "qualification", "highest_qualification", "education"] },
  { key: "gender", label: "Gender", kind: "value", candidates: ["gender", "sex"] },
  { key: "native_language", label: "Native Language", kind: "value", candidates: ["native_language", "mother_tongue"] },
  { key: "workspace", label: "June 2026 Workspace", kind: "value", candidates: ["workspace"] },
  { key: "emp_state", label: "State", kind: "value", candidates: ["current_state", "state", "work_state", "permanent_state"] },
  { key: "emp_district", label: "District", kind: "value", candidates: ["current_district_code", "district", "current_district"] },
  { key: "emp_city", label: "City", kind: "value", candidates: ["current_city", "city", "work_city"] },
];
// Special (not simple copies): employeeId (match key), uid (create/fill-only — it drives the
// BigQuery training match, so an existing uid is never overwritten), employment status → EXITED.
export const EMPLOYEE_ID_KEYS = ["employee_id", "emp_id", "employee_code", "employee_no", "employeeid"];
export const UID_KEYS = ["candidate_uid", "uid", "user_unique_id", "unique_id"];
export const STATUS_KEYS = ["employment_status", "employee_status", "emp_status", "status"];
export const EXIT_DATE_KEYS = ["date_of_exit", "exit_date", "last_working_day", "lwd", "date_of_leaving", "relieving_date"];
const EXITED_HINTS = ["exit", "resign", "terminat", "separat", "reliev", "abscond", "inactive"];

export function pickCol(cols: string[], candidates: string[]): string {
  const byNorm = new Map(cols.map((c) => [norm(c), c]));
  for (const c of candidates) { const hit = byNorm.get(norm(c)); if (hit) return hit; }
  return "";
}

// Darwinbox (India) dates are typically dd-mm-yyyy — normalize to yyyy-mm-dd for our DATE fields.
export function normDate(v: any): string {
  const s = clean(v);
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(+d) ? s : d.toISOString().slice(0, 10);
}

export const isExited = (status: string) => { const l = clean(status).toLowerCase(); return EXITED_HINTS.some((h) => l.includes(h)); };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SyncChange = { key: string; label: string; old: string; new: string };
export type SyncPlan = {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  mapping: { target: string; label: string; source: string }[];
  unmapped: string[];
  departments: { name: string; count: number; included: boolean }[];
  summary: { darwinboxTotal: number; inScope: number; matched: number; creates: number; updates: number; changedFields: number; exits: number; skipped: number; notInDarwinbox: number };
  creates: { employeeId: string; name: string; email: string; campus: string; exited: boolean; fields: Record<string, string> }[];
  updates: { id: string; employeeId: string; name: string; changes: SyncChange[] }[];
  exits: { id: string; employeeId: string; name: string; exitDate: string }[];
  skipped: { employeeId: string; name: string; reason: string }[];
  notInDarwinbox: { employeeId: string; name: string }[];
};

const emptyPlan = (error: string): SyncPlan => ({
  ok: false, error, fetchedAt: new Date().toISOString(), mapping: [], unmapped: [], departments: [],
  summary: { darwinboxTotal: 0, inScope: 0, matched: 0, creates: 0, updates: 0, changedFields: 0, exits: 0, skipped: 0, notInDarwinbox: 0 },
  creates: [], updates: [], exits: [], skipped: [], notInDarwinbox: [],
});

export async function buildDarwinboxSyncPlan(refresh?: boolean): Promise<SyncPlan> {
  const data = await getDarwinboxData(refresh);
  if (!data.ok) return emptyPlan(data.error || "Darwinbox fetch failed.");
  await ensureMasterFields(); // make sure every target dynamic field exists

  const cols = data.columns;
  const empCol = pickCol(cols, EMPLOYEE_ID_KEYS);
  if (!empCol) return emptyPlan(`Couldn't find an Employee ID column in the Darwinbox response (columns: ${cols.slice(0, 20).join(", ")}).`);
  const uidCol = pickCol(cols, UID_KEYS);
  const statusCol = pickCol(cols, STATUS_KEYS);
  const exitDateCol = pickCol(cols, EXIT_DATE_KEYS);
  const deptCol = pickCol(cols, ["department", "department_name", "dept"]);
  const resolved = TARGETS.map((t) => ({ t, col: pickCol(cols, t.candidates) }));
  const rmCol = resolved.find((r) => r.t.key === "reporting_manager")?.col || "";

  const mapping = [
    { target: "employeeId", label: "Employee ID (match key)", source: empCol },
    ...resolved.filter((r) => r.col).map((r) => ({ target: r.t.key, label: r.t.label, source: r.col })),
    ...(rmCol ? [{ target: "reporting_manager_employee_id", label: "Reporting Manager Employee ID", source: `${rmCol} → (NWxxxx)` }] : []),
    ...(uidCol ? [{ target: "uid", label: "UID (create/fill only)", source: uidCol }] : []),
    ...(statusCol ? [{ target: "status", label: "Employment Status", source: statusCol }] : []),
    ...(exitDateCol ? [{ target: "exit_date", label: "Exit Date", source: exitDateCol }] : []),
  ];
  const unmapped = [
    ...resolved.filter((r) => !r.col).map((r) => r.t.label),
    ...(uidCol ? [] : ["UID"]), ...(statusCol ? [] : ["Employment Status"]), ...(exitDateCol ? [] : ["Exit Date"]),
  ];

  // Department breakdown of the FULL feed + scope filter (only our departments are synced).
  const deptCounts = new Map<string, number>();
  for (const r of data.rows) { const d = deptCol ? clean(r[deptCol]) || "(blank)" : "(no department column)"; deptCounts.set(d, (deptCounts.get(d) || 0) + 1); }
  const departments = [...deptCounts.entries()]
    .map(([name, count]) => ({ name, count, included: deptCol ? isOurDepartment(name) : true }))
    .sort((a, b) => b.count - a.count);
  // If Darwinbox has no department column, the feed is assumed to be pre-scoped to instructors.
  const inScope = deptCol ? data.rows.filter((r) => isOurDepartment(clean(r[deptCol]))) : data.rows;

  // Field sensitivity (for encrypt-at-rest parity with every other edit path).
  const defs = await FieldDefinition.find({ archivedAt: null }).select("key visibility type").lean();
  const sensitive = new Set((defs as any[]).filter((d) => d.visibility === "SENSITIVE").map((d) => d.key));

  const instructors = await Instructor.find({}).select("employeeId name email campus uid status values exit").lean();
  const byEmp = new Map<string, any>();
  for (const i of instructors as any[]) { const k = norm(i.employeeId); if (k && !byEmp.has(k)) byEmp.set(k, i); }
  const emailOwner = new Map<string, string>(); // email → instructor id (conflict detection)
  for (const i of instructors as any[]) if (i.email) emailOwner.set(String(i.email).toLowerCase(), String(i._id));

  const plan = emptyPlan("");
  plan.ok = true;
  plan.error = undefined;
  plan.fetchedAt = data.fetchedAt;
  plan.mapping = mapping;
  plan.unmapped = unmapped;
  plan.departments = departments;

  const seenEmp = new Set<string>();
  const stored = (inst: any, key: string): string => {
    const raw = inst.values?.[key];
    if (raw == null) return "";
    const dec = maybeDecrypt(raw);
    return isEncrypted(raw) && dec === null ? "[unable to decrypt]" : clean(dec);
  };

  for (const row of inScope) {
    const employeeId = clean(row[empCol]);
    const name = clean(resolved.find((r) => r.t.key === "name")?.col ? row[resolved.find((r) => r.t.key === "name")!.col] : "") || employeeId;
    if (!employeeId) { plan.skipped.push({ employeeId: "", name, reason: "Missing Employee ID" }); continue; }
    const empKey = norm(employeeId);
    if (seenEmp.has(empKey)) { plan.skipped.push({ employeeId, name, reason: "Duplicate Employee ID in Darwinbox data" }); continue; }
    seenEmp.add(empKey);

    const exited = statusCol ? isExited(row[statusCol]) : false;
    const exitDate = exitDateCol ? normDate(row[exitDateCol]) : "";
    const inst = byEmp.get(empKey);

    // Incoming values (normalized); blanks are skipped — Darwinbox never wipes our data.
    const incoming: { key: string; label: string; kind: "core" | "value"; value: string }[] = [];
    for (const { t, col } of resolved) {
      if (!col) continue;
      let v = clean(row[col]);
      if (!v) continue;
      if (t.date) v = normDate(v);
      if (t.key === "email") { v = v.toLowerCase(); if (!EMAIL_RE.test(v)) continue; }
      incoming.push({ key: t.key, label: t.label, kind: t.kind, value: v });
    }
    // Derived: Reporting Manager Employee ID — Darwinbox `direct_manager` is "Name (NWxxxx)";
    // pull the trailing (NWxxxx) code into its own column. If no code, leave blank (don't corrupt).
    const rmName = incoming.find((c) => c.key === "reporting_manager")?.value || "";
    const rmId = (rmName.match(/\((NW[^)]+)\)\s*$/i) || [])[1];
    if (rmId) incoming.push({ key: "reporting_manager_employee_id", label: "Reporting Manager Employee ID", kind: "value", value: rmId.trim() });

    if (!inst) {
      // NEW in Darwinbox → create (exited employees are created as EXITED so the master stays complete).
      const emailIn = incoming.find((c) => c.key === "email")?.value || "";
      const fields: Record<string, string> = {};
      for (const c of incoming) if (c.kind === "value") fields[c.key] = c.value;
      if (exited && exitDate) fields.exit_date = exitDate;
      plan.creates.push({
        employeeId,
        name: incoming.find((c) => c.key === "name")?.value || employeeId,
        email: emailIn && emailOwner.has(emailIn) ? "" : emailIn, // conflict → create without email
        campus: incoming.find((c) => c.key === "campus")?.value || "",
        exited,
        fields: { ...fields, ...(uidCol && clean(row[uidCol]) ? { __uid: clean(row[uidCol]) } : {}) },
      });
      if (emailIn && emailOwner.has(emailIn)) plan.skipped.push({ employeeId, name, reason: `Email ${emailIn} already belongs to another instructor — created without email` });
      continue;
    }

    // MATCHED → diff each mapped field (Darwinbox wins; blanks skipped above).
    const changes: SyncChange[] = [];
    for (const c of incoming) {
      let old = "";
      if (c.kind === "core") old = clean((inst as any)[c.key]);
      else old = stored(inst, c.key);
      const same = c.key === "doj" ? normDate(old) === c.value : old === c.value;
      if (same) continue;
      if (c.key === "email") {
        const owner = emailOwner.get(c.value);
        if (owner && owner !== String(inst._id)) { plan.skipped.push({ employeeId, name: inst.name, reason: `Email ${c.value} already belongs to another instructor — email not updated` }); continue; }
      }
      const mask = sensitive.has(c.key);
      changes.push({ key: c.key, label: c.label, old: mask ? "••••" : old, new: mask ? "••••" : c.value });
    }
    // uid: fill only when ours is empty (it drives BigQuery training matching — never overwrite).
    if (uidCol && !clean(inst.uid) && clean(row[uidCol])) changes.push({ key: "uid", label: "UID", old: "", new: clean(row[uidCol]) });

    if (changes.length) plan.updates.push({ id: String(inst._id), employeeId, name: inst.name, changes });
    if (exited && inst.status !== "EXITED") plan.exits.push({ id: String(inst._id), employeeId, name: inst.name, exitDate });
  }

  // Info-only: instructors we track that Darwinbox (in-scope) doesn't have.
  for (const i of instructors as any[]) if (!seenEmp.has(norm(i.employeeId))) plan.notInDarwinbox.push({ employeeId: i.employeeId, name: i.name });

  plan.summary = {
    darwinboxTotal: data.rows.length,
    inScope: inScope.length,
    matched: inScope.length - plan.creates.length - plan.skipped.filter((s) => s.reason.startsWith("Missing") || s.reason.startsWith("Duplicate")).length,
    creates: plan.creates.length,
    updates: plan.updates.length,
    changedFields: plan.updates.reduce((s, u) => s + u.changes.length, 0),
    exits: plan.exits.length,
    skipped: plan.skipped.length,
    notInDarwinbox: plan.notInDarwinbox.length,
  };
  return plan;
}

export type SyncReport = { ok: boolean; error?: string; created: number; updated: number; changedFields: number; exited: number; skipped: number; errors: string[] };

// Recomputes the plan server-side and applies it (never trusts a client-supplied plan).
export async function applyDarwinboxSync(actor: SessionUser, refresh?: boolean): Promise<SyncReport & { plan?: SyncPlan }> {
  const plan = await buildDarwinboxSyncPlan(refresh);
  if (!plan.ok) return { ok: false, error: plan.error, created: 0, updated: 0, changedFields: 0, exited: 0, skipped: plan.skipped.length, errors: [] };

  const defs = await FieldDefinition.find({ archivedAt: null }).select("key visibility label").lean();
  const sensitive = new Set((defs as any[]).filter((d) => d.visibility === "SENSITIVE").map((d) => d.key));
  const audits: any[] = [];
  const errors: string[] = [];
  const base = { actorId: actor.id, actorName: actor.name, actorRole: actor.role, reason: "Darwinbox sync" };
  let created = 0, updated = 0, changedFields = 0, exited = 0;

  // 1) Creates
  for (const c of plan.creates) {
    try {
      const status = c.exited ? "EXITED" : "ONBOARDING";
      const values: Record<string, string> = {};
      let uid: string | null = null;
      for (const [k, v] of Object.entries(c.fields)) {
        if (k === "__uid") { uid = v; continue; }
        values[k] = sensitive.has(k) ? encrypt(v) ?? "" : v;
      }
      const inst = await Instructor.create({
        employeeId: c.employeeId, name: c.name, email: c.email || null, campus: c.campus || null, uid, status, values,
        exit: c.exited && c.fields.exit_date ? { lastWorkingDay: c.fields.exit_date } : undefined,
        lifecycle: [{ status, note: "Created via Darwinbox sync", actorId: actor.id, actorName: actor.name }],
      });
      audits.push({ instructorId: inst._id, instructorName: inst.name, ...base, action: "INSTRUCTOR_CREATE", newValue: c.employeeId });
      created++;
    } catch (e: any) {
      errors.push(`Create ${c.employeeId}: ${e?.message || "failed"}`);
    }
  }

  // 2) Updates — one load+save per instructor (not per field), audits batched at the end.
  const exitById = new Map(plan.exits.map((x) => [x.id, x]));
  const updateIds = new Set([...plan.updates.map((u) => u.id), ...plan.exits.map((x) => x.id)]);
  const changesById = new Map(plan.updates.map((u) => [u.id, u]));
  for (const id of updateIds) {
    try {
      const inst: any = await Instructor.findById(id);
      if (!inst) { errors.push(`Update ${id}: instructor not found`); continue; }
      const u = changesById.get(id);
      for (const ch of u?.changes || []) {
        const isCore = ch.key === "name" || ch.key === "email" || ch.key === "campus" || ch.key === "uid";
        // Re-read the real old value (plan values may be masked for sensitive fields).
        let oldVal: string | null;
        let newVal = ch.new;
        if (isCore) { oldVal = clean(inst[ch.key]); inst[ch.key] = ch.key === "email" ? ch.new.toLowerCase() : ch.new; }
        else {
          const raw = inst.values.get(ch.key);
          const dec = maybeDecrypt(raw);
          oldVal = raw == null ? null : (isEncrypted(raw) && dec === null ? "[unable to decrypt]" : dec);
          const mask = sensitive.has(ch.key);
          inst.values.set(ch.key, mask ? encrypt(newVal) ?? "" : newVal);
          if (mask) { oldVal = "••••"; newVal = "••••"; }
        }
        audits.push({ instructorId: inst._id, instructorName: inst.name, ...base, action: "FIELD_EDIT", fieldName: ch.label, oldValue: oldVal, newValue: newVal });
        changedFields++;
      }
      const x = exitById.get(id);
      if (x && inst.status !== "EXITED") {
        const old = inst.status;
        inst.status = "EXITED";
        inst.lifecycle.push({ status: "EXITED", note: "Darwinbox sync (employment status)", actorId: actor.id, actorName: actor.name });
        if (x.exitDate) { inst.exit = inst.exit || {}; inst.exit.lastWorkingDay = x.exitDate; inst.values.set("exit_date", x.exitDate); }
        audits.push({ instructorId: inst._id, instructorName: inst.name, ...base, action: "LIFECYCLE_CHANGE", fieldName: "Lifecycle status", oldValue: old, newValue: "EXITED" });
        exited++;
      }
      await inst.save();
      if (u?.changes.length) updated++;
    } catch (e: any) {
      errors.push(`Update ${changesById.get(id)?.employeeId || id}: ${e?.message || "failed"}`);
    }
  }

  // Batched audit trail + one summary entry for the run itself.
  audits.push({ ...base, action: "DARWINBOX_SYNC", fieldName: "Darwinbox sync", newValue: `${created} created, ${updated} updated (${changedFields} fields), ${exited} exited, ${plan.skipped.length} skipped` });
  try { await AuditLog.insertMany(audits, { ordered: false }); } catch (e: any) { errors.push(`Audit write: ${e?.message}`); }

  return { ok: true, created, updated, changedFields, exited, skipped: plan.skipped.length, errors };
}
