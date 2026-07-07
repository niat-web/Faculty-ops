import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User, SeniorManager } from "../models";
import { Role } from "../enums";
import { loadLiveMasterRows } from "./masterLive";
import { getDarwinboxData } from "./darwinbox";
import { norm, clean, pickCol, EMPLOYEE_ID_KEYS } from "./darwinboxSync";

// Darwinbox-derived staff roles for the Roles page + Users page:
//  - Ops Admins  = everyone in the "Instructors – Delivery Support (Ops and Central Managers)" department.
//  - Instructors = every other instructor department, EXCEPT the support/non-teaching ones below.
//  - Senior Managers = an admin-curated list (SeniorManager collection).
//  - Capability Managers = the unique Darwinbox reporting managers (reporting_manager field).
// Ops Admins + Senior Managers are also mirrored into the Users collection as INACTIVE/pending accounts
// (no login until an Ops Admin activates them), deduped by email.

export const OPS_DEPT_RE = /delivery support/i;                                   // → Ops Admins
export const NON_INSTRUCTOR_DEPT_RE = /delivery support|instructor platform|product team/i; // excluded from Instructors
export const isOpsDept = (dept: any) => OPS_DEPT_RE.test(String(dept || ""));
export const isInstructorDept = (dept: any) => !NON_INSTRUCTOR_DEPT_RE.test(String(dept || ""));

export type StaffPerson = { employeeId: string; name: string; email: string; department: string; designation: string };

// Upsert a pending (inactive) staff User, deduped by email. Returns "created" | "exists" | "skipped".
export async function ensureStaffUser(p: { name: string; email: string; role: string }): Promise<"created" | "exists" | "skipped"> {
  const email = String(p.email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "skipped";
  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) return "exists"; // already in Mongo → don't duplicate
  const passwordHash = bcrypt.hashSync("pending-" + crypto.randomBytes(16).toString("hex"), 10);
  await User.create({ name: p.name || email, email, role: p.role, passwordHash, active: false, mustSetPassword: true });
  return "created";
}

// The live Ops-Admin population (Darwinbox "Delivery Support" department, active).
export async function getOpsAdminPeople(): Promise<StaffPerson[]> {
  const live = await loadLiveMasterRows();
  if (!live.ok) return [];
  return live.rows
    .filter((r) => !r.exited && isOpsDept(r.department))
    .map((r) => ({ employeeId: r.employeeId, name: r.name || r.employeeId, email: r.email || "", department: r.department || "", designation: r.designation || "" }));
}

// Mirror the current Ops-Admin people into Users as inactive accounts (deduped). Idempotent.
export async function syncOpsAdminUsers(): Promise<{ created: number; existing: number }> {
  const people = await getOpsAdminPeople();
  let created = 0, existing = 0;
  for (const p of people) {
    const r = await ensureStaffUser({ name: p.name, email: p.email, role: Role.OPS_ADMIN });
    if (r === "created") created++; else if (r === "exists") existing++;
  }
  if (created) console.log(`[staff-sync] created ${created} pending Ops-Admin user(s)`);
  return { created, existing };
}

// The unique Darwinbox reporting managers (= Capability Managers), with reportee counts.
export async function getReportingManagers(): Promise<{ managerId: string | null; name: string; count: number }[]> {
  const live = await loadLiveMasterRows();
  if (!live.ok) return [];
  const m = new Map<string, number>();
  for (const r of live.rows) {
    if (r.exited || !isInstructorDept(r.department)) continue;
    const raw = String(r.reporting_manager || "").trim();
    if (!raw) continue;
    m.set(raw, (m.get(raw) || 0) + 1);
  }
  return [...m.entries()]
    .map(([raw, count]) => {
      const id = (raw.match(/\((NW[^)]+)\)/i) || [])[1] || "";
      const name = raw.replace(/\s*\(NW[^)]*\)\s*$/i, "").trim();
      return { managerId: id || null, name: name || raw, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Employee-id set of the admin-curated Senior Managers (for filtering the Master).
export async function seniorManagerIdSet(): Promise<Set<string>> {
  const list = await SeniorManager.find().select("employeeId").lean();
  return new Set((list as any[]).map((s) => norm(s.employeeId)));
}

// Full Darwinbox directory (ALL employees, not just instructor departments) — for the
// Senior-Manager picker, since managers may sit outside the instructor departments.
const NAME_KEYS = ["full_name", "employee_name", "name", "display_name"];
const EMAIL_KEYS = ["org_email_id", "official_email_id", "official_email", "company_email_id", "email_id", "work_email", "email"];
const DEPT_KEYS = ["department", "department_name", "dept"];
const DESIG_KEYS = ["designation", "designation_name", "job_title", "role", "title"];

export async function darwinboxDirectory(): Promise<StaffPerson[]> {
  const data = await getDarwinboxData(false);
  if (!data.ok) return [];
  const cols = data.columns;
  const empCol = pickCol(cols, EMPLOYEE_ID_KEYS);
  const nameCol = pickCol(cols, NAME_KEYS), emailCol = pickCol(cols, EMAIL_KEYS);
  const deptCol = pickCol(cols, DEPT_KEYS), desigCol = pickCol(cols, DESIG_KEYS);
  if (!empCol) return [];
  return data.rows
    .map((r) => ({
      employeeId: clean(r[empCol]),
      name: clean(nameCol ? r[nameCol] : "") || clean(r[empCol]),
      email: clean(emailCol ? r[emailCol] : ""),
      department: clean(deptCol ? r[deptCol] : ""),
      designation: clean(desigCol ? r[desigCol] : ""),
    }))
    .filter((p) => p.employeeId);
}

export async function searchDarwinbox(q: string, limit = 20): Promise<StaffPerson[]> {
  const dir = await darwinboxDirectory();
  const n = q.trim().toLowerCase();
  const hits = n ? dir.filter((p) => p.name.toLowerCase().includes(n) || p.employeeId.toLowerCase().includes(n) || p.email.toLowerCase().includes(n)) : dir;
  return hits.slice(0, limit);
}

export async function findDarwinboxEmployee(employeeId: string): Promise<StaffPerson | null> {
  const dir = await darwinboxDirectory();
  return dir.find((p) => norm(p.employeeId) === norm(employeeId)) || null;
}

// Resolve a Capability Manager User → their own Darwinbox Employee ID (via org email), so the Master
// can scope them to the instructors who report to them (reporting_manager_employee_id === this id).
// Returns null if their email isn't found in Darwinbox (→ caller should show no rows, not all).
export async function cmDarwinboxEmployeeId(user: { email?: string }): Promise<string | null> {
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return null;
  const dir = await darwinboxDirectory();
  const me = dir.find((p) => p.email.toLowerCase() === email);
  return me ? me.employeeId : null;
}
