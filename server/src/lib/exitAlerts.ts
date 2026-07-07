import { Instructor, User, ExitAlert } from "../models";
import { Role, NotificationType } from "../enums";
import { getDarwinboxData } from "./darwinbox";
import {
  clean, norm, isOurDepartment, pickCol, normDate,
  EMPLOYEE_ID_KEYS, STATUS_KEYS, EXIT_DATE_KEYS,
} from "./darwinboxSync";
import { getExitAlerts } from "./settings";
import { notify } from "./services";

// Exit-alert detection — runs after every Darwinbox → Mongo sync.
// For instructor-department employees whose last-working-day (date_of_exit) is inside the
// admin lead window, raise ONE ExitAlert per (employeeId, exitDate) and bell the Ops
// Admins + Senior Managers. The Capability Manager the instructor reports to sees it as a
// dashboard banner (via GET /exit-alerts) and finalises the outcome.

const NAME_KEYS = ["full_name", "employee_name", "name", "display_name"];
const EMAIL_KEYS = ["org_email_id", "official_email_id", "official_email", "company_email_id", "email_id", "work_email", "email"];
const DESIG_KEYS = ["designation", "designation_name", "job_title", "role", "title"];
const PHONE_KEYS = ["primary_mobile_number", "mobile_number", "mobile_no", "mobile", "phone_number", "phone", "contact_number"];
const DEPT_KEYS = ["department", "department_name", "dept"];

const MAX_PAST_DAYS = 30; // surface a just-passed exit we may have missed, but not ancient history

export function daysUntil(dateStr: string): number | null {
  const t = Date.parse(String(dateStr || ""));
  if (isNaN(t)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / (24 * 3600 * 1000));
}

export type DetectReport = { ok: boolean; error?: string; scanned: number; created: number };

export async function detectExitAlerts(): Promise<DetectReport> {
  const data = await getDarwinboxData(false);
  if (!data.ok) return { ok: false, error: data.error || "Darwinbox fetch failed.", scanned: 0, created: 0 };

  const cols = data.columns;
  const empCol = pickCol(cols, EMPLOYEE_ID_KEYS);
  const exitCol = pickCol(cols, EXIT_DATE_KEYS);
  const deptCol = pickCol(cols, DEPT_KEYS);
  if (!empCol || !exitCol) return { ok: false, error: "Darwinbox response is missing Employee ID or Exit Date columns.", scanned: 0, created: 0 };
  const nameCol = pickCol(cols, NAME_KEYS);
  const emailCol = pickCol(cols, EMAIL_KEYS);
  const desigCol = pickCol(cols, DESIG_KEYS);
  const phoneCol = pickCol(cols, PHONE_KEYS);

  const { leadDays } = await getExitAlerts();

  // Candidate rows: in-scope (instructor department) + a last-working-day inside the window.
  type Cand = { employeeId: string; exitDate: string; row: Record<string, any> };
  const candidates: Cand[] = [];
  for (const row of data.rows) {
    if (deptCol && !isOurDepartment(clean(row[deptCol]))) continue;
    const employeeId = clean(row[empCol]);
    const exitDate = normDate(row[exitCol]);
    if (!employeeId || !exitDate) continue;
    const d = daysUntil(exitDate);
    if (d == null) continue;
    if (d > leadDays) continue;          // still outside the lead window — not yet
    if (d < -MAX_PAST_DAYS) continue;    // too far in the past — ignore
    candidates.push({ employeeId, exitDate, row });
  }
  if (!candidates.length) return { ok: true, scanned: data.rows.length, created: 0 };

  // Which (employeeId, exitDate) pairs already have an alert? (dedup — don't re-raise or re-notify)
  const existing = await ExitAlert.find({
    employeeId: { $in: candidates.map((c) => c.employeeId) },
  }).select("employeeId exitDate").lean();
  const seen = new Set(existing.map((e: any) => `${norm(e.employeeId)}|${e.exitDate}`));

  const fresh = candidates.filter((c) => !seen.has(`${norm(c.employeeId)}|${c.exitDate}`));
  if (!fresh.length) return { ok: true, scanned: data.rows.length, created: 0 };

  // Resolve each fresh employee's Instructor record (for instructorId + capability manager).
  const insts = await Instructor.find({ employeeId: { $in: fresh.map((c) => c.employeeId) } })
    .select("employeeId name email currentManagerId values").lean();
  const instByEmp = new Map<string, any>();
  for (const i of insts as any[]) instByEmp.set(norm(i.employeeId), i);

  // Route each alert to the Capability Manager the instructor reports to IN DARWINBOX (reporting_manager),
  // not the app's currentManagerId (often unset). Map: Darwinbox employee-id → org email (from the live
  // feed) → User account. Falls back to currentManagerId if the reporting manager has no User.
  const rmCol = pickCol(cols, ["direct_manager", "reporting_manager", "reporting_manager_name", "manager_name", "reporting_to"]);
  const emailByEmp = new Map<string, string>();
  if (emailCol) for (const r of data.rows) { const eid = norm(clean(r[empCol])); const em = clean(r[emailCol]).toLowerCase(); if (eid && em) emailByEmp.set(eid, em); }
  const users = await User.find({ active: true }).select("_id name email role").lean();
  const userByEmail = new Map<string, any>();
  const userById = new Map<string, any>();
  for (const u of users as any[]) { if (u.email) userByEmail.set(String(u.email).toLowerCase(), u); userById.set(String(u._id), u); }

  // Recipients for the bell: active Ops Admins + Senior Managers.
  const staff = (users as any[]).filter((u) => u.role === Role.OPS_ADMIN || u.role === Role.SENIOR_MANAGER);

  let created = 0;
  for (const c of fresh) {
    const inst = instByEmp.get(norm(c.employeeId));
    // Reporting manager (Darwinbox) → their User account.
    const rmRaw = clean(rmCol ? c.row[rmCol] : "") || clean(inst?.values?.reporting_manager || "");
    const rmEmpId = (rmRaw.match(/\((NW[^)]+)\)/i) || [])[1] || "";
    const rmUser = rmEmpId ? userByEmail.get(emailByEmp.get(norm(rmEmpId)) || "") : null;
    const managerId = rmUser ? String(rmUser._id) : (inst?.currentManagerId ? String(inst.currentManagerId) : null);
    const managerName = (managerId ? userById.get(managerId)?.name : "") || rmRaw.replace(/\s*\(NW[^)]*\)\s*$/i, "").trim() || "";
    const name = clean(nameCol ? c.row[nameCol] : "") || inst?.name || c.employeeId;
    try {
      await ExitAlert.create({
        instructorId: inst?._id || null,
        employeeId: c.employeeId,
        name,
        email: clean(emailCol ? c.row[emailCol] : "") || inst?.email || "",
        role: clean(desigCol ? c.row[desigCol] : ""),
        mobile: clean(phoneCol ? c.row[phoneCol] : ""),
        department: clean(deptCol ? c.row[deptCol] : ""),
        managerId,
        managerName,
        exitDate: c.exitDate,
        status: "PENDING",
      });
      created++;
    } catch (e: any) {
      // Duplicate-key (raced with another run) is fine; anything else is logged.
      if (e?.code !== 11000) console.error("[exit-alerts] create failed:", e?.message);
      continue;
    }
    // Bell the Ops Admins + Senior Managers (in-app only; no email storm).
    const d = daysUntil(c.exitDate);
    const when = d == null ? c.exitDate : d < 0 ? `${Math.abs(d)} day(s) ago` : d === 0 ? "today" : `in ${d} day(s)`;
    for (const s of staff as any[]) {
      await notify(String(s._id), {
        type: NotificationType.EXIT_ALERT,
        title: `Exit alert: ${name}`,
        body: `${name} (${c.employeeId}) has a last working day of ${c.exitDate} — ${when}.`,
        link: "/app/dashboard",
        email: false,
      });
    }
  }
  if (created) console.log(`[exit-alerts] raised ${created} new exit alert(s)`);
  return { ok: true, scanned: data.rows.length, created };
}
