import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User, SeniorManager, DarwinboxEmployee } from "../models";
import { Role } from "../enums";
import { loadLiveMasterRows } from "./masterLive";
import { getDarwinboxData } from "./darwinbox";
import { norm, clean, pickCol, EMPLOYEE_ID_KEYS } from "./darwinboxSync";

// Darwinbox-derived staff roles for the Roles page + Users page:
//  - Ops Admins  = everyone in the "Instructors – Delivery Support (Ops and Central Managers)" department.
//  - Instructors = every other instructor department, EXCEPT the support/non-teaching ones below.
//  - Senior Managers = an admin-curated list (SeniorManager collection).
//  - Capability Managers = the unique Darwinbox reporting managers (reporting_manager field).
// Ops Admins + Senior Managers are also mirrored into the Users collection as "Pending password"
// accounts (active, but with no usable password — an Ops Admin sends them a set-password invite),
// deduped by email.
//
// The FULL Darwinbox directory (every employee + their manager) is MIRRORED INTO MONGODB
// (DarwinboxEmployee, refreshed by the hourly sync via syncDarwinboxDirectory). Every reader below
// serves from that Mongo mirror — NO live Darwinbox call happens on a user page load.

export const OPS_DEPT_RE = /delivery support/i;                                   // → Ops Admins
export const NON_INSTRUCTOR_DEPT_RE = /delivery support|instructor platform|product team/i; // excluded from Instructors
export const isOpsDept = (dept: any) => OPS_DEPT_RE.test(String(dept || ""));
export const isInstructorDept = (dept: any) => !NON_INSTRUCTOR_DEPT_RE.test(String(dept || ""));

export type StaffPerson = { employeeId: string; name: string; email: string; department: string; designation: string };
export type DirectoryPerson = StaffPerson & { managerName: string; managerEmployeeId: string };

// Upsert a "Pending password" staff User, deduped by email. Returns "created" | "exists" | "skipped".
// Created ACTIVE but with an unusable random password + mustSetPassword — so they show as "Pending
// password" (invite-ready) in the Users table and can't sign in until an Ops Admin sends them the
// set-password invite. (No password login is possible with the random hash.)
export async function ensureStaffUser(p: { name: string; email: string; role: string }): Promise<"created" | "exists" | "skipped"> {
  const email = String(p.email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "skipped";
  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) return "exists"; // already in Mongo → don't duplicate
  const passwordHash = bcrypt.hashSync("pending-" + crypto.randomBytes(16).toString("hex"), 10);
  await User.create({ name: p.name || email, email, role: p.role, passwordHash, active: true, mustSetPassword: true });
  return "created";
}

// The live Ops-Admin population (Darwinbox "Delivery Support" department, active) — from Mongo.
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

// The unique Darwinbox reporting managers (= Capability Managers), with reportee counts — from Mongo.
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

// ─── Darwinbox directory: MongoDB mirror ────────────────────────────────────
// Raw-feed column candidates (same resolution as the employee sync).
const NAME_KEYS = ["full_name", "employee_name", "name", "display_name"];
const EMAIL_KEYS = ["org_email_id", "official_email_id", "official_email", "company_email_id", "email_id", "work_email", "email"];
const DEPT_KEYS = ["department", "department_name", "dept"];
const DESIG_KEYS = ["designation", "designation_name", "job_title", "role", "title"];
const MANAGER_NAME_KEYS = ["direct_manager", "reporting_manager", "reporting_manager_name", "direct_manager_name", "manager_name", "reporting_to"];
const MANAGER_ID_KEYS = ["direct_manager_employee_id", "reporting_manager_employee_id", "manager_employee_id", "direct_manager_id", "reporting_manager_id", "manager_id"];

// Pull the FULL Darwinbox feed and mirror it into the DarwinboxEmployee collection (upsert by
// Employee ID — no duplicates; entries that drop out of the feed are kept with their last-known data,
// which keeps old manager names resolvable). Called by the hourly sync right after the employee sync
// (the feed is already cached, so this adds no extra Darwinbox HTTP call).
export async function syncDarwinboxDirectory(): Promise<{ ok: boolean; count: number; error?: string }> {
  const data = await getDarwinboxData(false);
  if (!data.ok) return { ok: false, count: 0, error: data.error };
  const cols = data.columns;
  const empCol = pickCol(cols, EMPLOYEE_ID_KEYS);
  if (!empCol) return { ok: false, count: 0, error: "No Employee ID column in the Darwinbox feed." };
  const nameCol = pickCol(cols, NAME_KEYS), emailCol = pickCol(cols, EMAIL_KEYS);
  const deptCol = pickCol(cols, DEPT_KEYS), desigCol = pickCol(cols, DESIG_KEYS);
  const mgrNameCol = pickCol(cols, MANAGER_NAME_KEYS), mgrIdCol = pickCol(cols, MANAGER_ID_KEYS);
  const rmidFromName = (s: any) => (String(s || "").match(/\((NW[^)]+)\)/i) || [])[1] || "";

  const now = new Date();
  const seen = new Set<string>();
  const ops: any[] = [];
  for (const r of data.rows) {
    const employeeId = clean(r[empCol]);
    const k = norm(employeeId);
    if (!employeeId || seen.has(k)) continue; // de-dupe within the feed
    seen.add(k);
    const managerName = clean(mgrNameCol ? r[mgrNameCol] : "");
    ops.push({
      updateOne: {
        filter: { employeeId },
        update: {
          $set: {
            name: clean(nameCol ? r[nameCol] : "") || employeeId,
            email: clean(emailCol ? r[emailCol] : "").toLowerCase(),
            department: clean(deptCol ? r[deptCol] : ""),
            designation: clean(desigCol ? r[desigCol] : ""),
            managerName,
            managerEmployeeId: clean(mgrIdCol ? r[mgrIdCol] : "") || rmidFromName(managerName),
            syncedAt: now,
          },
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await DarwinboxEmployee.bulkWrite(ops, { ordered: false });
  dirCache = null; // fresh directory → drop the in-process cache
  console.log(`[darwinbox-directory] mirrored ${ops.length} employee(s) into MongoDB`);
  return { ok: true, count: ops.length };
}

// In-process cache of the Mongo directory (refreshed hourly by the sync; TTL keeps hot paths cheap).
let dirCache: { at: number; people: DirectoryPerson[] } | null = null;
const DIR_TTL_MS = 5 * 60 * 1000;
let populating: Promise<void> | null = null;

async function loadDirectory(): Promise<DirectoryPerson[]> {
  if (dirCache && Date.now() - dirCache.at < DIR_TTL_MS) return dirCache.people;
  let docs = await DarwinboxEmployee.find({}).select("employeeId name email department designation managerName managerEmployeeId").lean();
  // First boot (before any hourly sync has run): populate the mirror once, deduped across callers.
  if (!docs.length) {
    if (!populating) populating = syncDarwinboxDirectory().then(() => {}).finally(() => { populating = null; });
    await populating;
    docs = await DarwinboxEmployee.find({}).select("employeeId name email department designation managerName managerEmployeeId").lean();
  }
  const people: DirectoryPerson[] = (docs as any[]).map((d) => ({
    employeeId: clean(d.employeeId),
    name: clean(d.name) || clean(d.employeeId),
    email: clean(d.email),
    department: clean(d.department),
    designation: clean(d.designation),
    managerName: clean(d.managerName),
    managerEmployeeId: clean(d.managerEmployeeId),
  })).filter((p) => p.employeeId);
  dirCache = { at: Date.now(), people };
  return people;
}

// Full Darwinbox directory (ALL employees, not just instructor departments) — served from MongoDB.
// Used by the Senior-Manager picker, since managers may sit outside the instructor departments.
export async function darwinboxDirectory(): Promise<StaffPerson[]> {
  return loadDirectory();
}

// Full directory WITH each person's own manager — the authoritative source for the org chart.
// Darwinbox has EVERY employee (managers included) and their reporting line, so a Capability Manager
// who isn't on the Instructor Master can still be placed under the right Senior Manager from here.
export async function darwinboxFullDirectory(): Promise<DirectoryPerson[]> {
  return loadDirectory();
}

export async function searchDarwinbox(q: string, limit = 20): Promise<StaffPerson[]> {
  const dir = await loadDirectory();
  // Admin-hidden (removed) people must not surface in any picker/search — including the PUBLIC
  // certificates employee-search. "Hidden everywhere" includes directory search.
  const { removedEmployeeIdSet } = await import("./removed");
  const removed = await removedEmployeeIdSet();
  const n = q.trim().toLowerCase();
  const hits = (n ? dir.filter((p) => p.name.toLowerCase().includes(n) || p.employeeId.toLowerCase().includes(n) || p.email.toLowerCase().includes(n)) : dir)
    .filter((p) => !removed.has(norm(p.employeeId)));
  return hits.slice(0, limit);
}

export async function findDarwinboxEmployee(employeeId: string): Promise<StaffPerson | null> {
  const { removedEmployeeIdSet } = await import("./removed");
  const removed = await removedEmployeeIdSet();
  if (removed.has(norm(employeeId))) return null; // hidden person → treat as not found
  const dir = await loadDirectory();
  return dir.find((p) => norm(p.employeeId) === norm(employeeId)) || null;
}

// Resolve a Capability Manager User → their own Darwinbox Employee ID (via org email), so the Master
// can scope them to the instructors who report to them (reporting_manager_employee_id === this id).
// Returns null if their email isn't found in the directory (→ caller should show no rows, not all).
export async function cmDarwinboxEmployeeId(user: { email?: string }): Promise<string | null> {
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return null;
  const dir = await loadDirectory();
  const me = dir.find((p) => p.email.toLowerCase() === email);
  return me ? me.employeeId : null;
}
