import { Instructor, ExitAlert } from "../models";
import { getDarwinboxData } from "./darwinbox";
import { maybeDecrypt } from "./crypto";
import {
  clean, norm, isOurDepartment, pickCol, normDate, isExited,
  TARGETS, EMPLOYEE_ID_KEYS, UID_KEYS, STATUS_KEYS, EXIT_DATE_KEYS,
} from "./darwinboxSync";
import { getActiveMasterColumns } from "./master";

// LIVE Instructor Master: rows come DIRECTLY from Darwinbox (filtered to instructor departments,
// keyed by Employee ID). The manually-editable FacultyOps columns (contribution, hod_interaction,
// contribution_region, payroll_entity, access_status, remarks, domain) are joined from MongoDB by
// Employee ID. No sync-into-Mongo — Darwinbox is read live (cached ~5min in getDarwinboxData).
//
//  - Darwinbox columns are READ-ONLY (source of truth is Darwinbox).
//  - Manual columns are editable → written to Mongo (auto-creating a minimal Instructor if needed).
//  - Rows that exist only in Darwinbox still show (manual columns blank).

// The Master value-keys that are NOT sourced from Darwinbox → come from Mongo. Anything a TARGET
// maps to (plus the derived reporting_manager_employee_id, uid, exit_date) is Darwinbox-owned.
const DARWINBOX_VALUE_KEYS = new Set<string>([
  ...TARGETS.filter((t) => t.kind === "value").map((t) => t.key),
  "reporting_manager_employee_id", "exit_date",
]);
// Core Darwinbox-owned keys (shown as read-only, sourced from Darwinbox).
const DARWINBOX_CORE_KEYS = new Set<string>(["employeeId", "name", "email", "campus", "uid"]);

export type LiveMasterRow = Record<string, any> & { id: string | null; employeeId: string; exited: boolean };

export type LiveMasterResult = {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  rows: LiveMasterRow[];
  counts: { all: number; active: number; exited: number };
  darwinboxKeys: string[]; // which column keys are Darwinbox-owned (read-only) — for the client
  departments: string[];   // unique department names in the live set (for the department quick-filter)
};

// Departments unchecked BY DEFAULT in the Master department filter (non-teaching support depts).
// Matched against the actual department strings (which carry a code suffix).
export const DEFAULT_UNCHECKED_DEPT_PATTERNS = [/delivery support/i, /^\s*instructor platform/i];
export const isDefaultUnchecked = (dept: string) => DEFAULT_UNCHECKED_DEPT_PATTERNS.some((re) => re.test(clean(dept)));

// Build every instructor-department row from Darwinbox, joined with Mongo manual columns.
export async function loadLiveMasterRows(refresh?: boolean): Promise<LiveMasterResult> {
  const data = await getDarwinboxData(refresh);
  if (!data.ok) return { ok: false, error: data.error || "Darwinbox fetch failed.", fetchedAt: data.fetchedAt, rows: [], counts: { all: 0, active: 0, exited: 0 }, darwinboxKeys: [], departments: [] };

  const cols = data.columns;
  const empCol = pickCol(cols, EMPLOYEE_ID_KEYS);
  const uidCol = pickCol(cols, UID_KEYS);
  const statusCol = pickCol(cols, STATUS_KEYS);
  const exitDateCol = pickCol(cols, EXIT_DATE_KEYS);
  const deptCol = pickCol(cols, ["department", "department_name", "dept"]);
  const resolved = TARGETS.map((t) => ({ t, col: pickCol(cols, t.candidates) }));

  // In-scope Darwinbox rows (instructor departments only).
  const inScope = deptCol ? data.rows.filter((r) => isOurDepartment(clean(r[deptCol]))) : data.rows;

  // Mongo manual columns, indexed by Employee ID (only the non-Darwinbox value keys + _id).
  const activeCols = await getActiveMasterColumns();
  const manualValueKeys = activeCols.filter((c) => c.source === "value" && !DARWINBOX_VALUE_KEYS.has(c.key)).map((c) => c.key);
  const mongoDocs = await Instructor.find({}).select("employeeId _id uid name email campus status exit values").lean();
  const byEmp = new Map<string, any>();
  for (const d of mongoDocs as any[]) { const k = norm(d.employeeId); if (k) byEmp.set(k, d); }

  // Capability-Manager exit-outcome overlay: once a CM finalises an exit alert, their decision
  // overrides Darwinbox's live status on this grid — "Actually exited" hides the row from Active
  // (→ Instructor Exited), while "University Payroll" / "Consultant→FTE rehire" keep them Active.
  const resolvedAlerts = await ExitAlert.find({ status: "RESOLVED" }).select("employeeId resolution resolvedAt").sort({ resolvedAt: 1 }).lean();
  const outcomeByEmp = new Map<string, string>();
  for (const a of resolvedAlerts as any[]) { const k = norm(a.employeeId); if (k && a.resolution) outcomeByEmp.set(k, a.resolution); } // later resolution wins

  const rows: LiveMasterRow[] = [];
  const seen = new Set<string>();
  for (const raw of inScope) {
    const employeeId = clean(raw[empCol]);
    if (!employeeId) continue;
    const empKey = norm(employeeId);
    if (seen.has(empKey)) continue; // de-dupe
    seen.add(empKey);

    const mongo = byEmp.get(empKey);
    const mongoVal = (key: string) => mongo ? (maybeDecrypt(mongo.values?.[key] ?? "") ?? "") : "";
    let exited = statusCol ? isExited(raw[statusCol]) : false;
    // Apply a CM's finalised exit outcome (overrides Darwinbox's live status on this grid).
    const outcome = outcomeByEmp.get(empKey);
    if (outcome === "EXITED") exited = true;
    else if (outcome === "UNIVERSITY_PAYROLL" || outcome === "CONSULTANT_REHIRE") exited = false;
    const exitDate = exitDateCol ? normDate(raw[exitDateCol]) : "";

    const row: LiveMasterRow = { id: mongo ? String(mongo._id) : null, employeeId, exited };

    // Darwinbox columns (read-only). For VALUE fields, fall back to the stored Mongo value when
    // Darwinbox is blank — so imported/enriched data (e.g. Qualification) still shows, matching the
    // CSV export. Core fields (name/email/campus) stay straight from Darwinbox.
    for (const { t, col } of resolved) {
      let v = col ? clean(raw[col]) : "";
      if (t.date) v = normDate(v);
      if (!v && t.kind === "value") { const fb = mongoVal(t.key); v = t.date ? normDate(fb) : fb; }
      row[t.key] = v;
    }
    // UID: prefer the canonical Mongo uid (the value shown in the CSV export and used for BigQuery
    // matching); fall back to the Darwinbox candidate_uid for rows that exist only in Darwinbox.
    row.uid = clean(mongo?.uid) || (uidCol ? clean(raw[uidCol]) : "");
    row.exit_date = exitDate;
    // Derived: Reporting Manager Employee ID from direct_manager "(NWxxxx)".
    row.reporting_manager_employee_id = ((row.reporting_manager || "").match(/\((NW[^)]+)\)\s*$/i) || [])[1] || "";
    // Core aliases the grid expects.
    row.name = row.name || "";
    row.email = row.email || "";
    row.campus = row.campus || "";
    row.status = exited ? "EXITED" : "ACTIVE";
    // Training % quick-view: the stored BigQuery-derived primary % for this employee (computed via UID on
    // the Training Stats page and persisted to Mongo), joined here by Employee ID — same value the Master
    // showed before the live-join. Blank only when we have no stored figure. No BigQuery call on the grid.
    const pctRaw = mongoVal("primary_pct");
    const pctNum = Number(pctRaw);
    row.training = pctRaw !== "" && !isNaN(pctNum) ? pctNum : null;

    // Manual columns from Mongo (blank if no record).
    for (const key of manualValueKeys) row[key] = mongoVal(key);

    rows.push(row);
  }

  // Mongo-only instructors: master data that exists in MongoDB but is NOT in the current Darwinbox feed
  // (imported/older records, exited people, or anyone Darwinbox no longer returns). Show them too, with
  // EVERY column sourced from Mongo (core fields from the doc, the rest from the values map, by key).
  const EXIT_STATES = new Set(["EXITED", "EXIT_IN_PROGRESS"]);
  for (const d of mongoDocs as any[]) {
    const empKey = norm(d.employeeId);
    if (!empKey || seen.has(empKey)) continue; // already shown via the Darwinbox feed
    seen.add(empKey);
    const mv = (key: string) => (maybeDecrypt(d.values?.[key] ?? "") ?? "");
    let exited = EXIT_STATES.has(String(d.status || ""));
    const outcome = outcomeByEmp.get(empKey);
    if (outcome === "EXITED") exited = true;
    else if (outcome === "UNIVERSITY_PAYROLL" || outcome === "CONSULTANT_REHIRE") exited = false;

    const row: LiveMasterRow = { id: String(d._id), employeeId: clean(d.employeeId), exited };
    // Every mapped column from Mongo: core fields from the doc, value fields from the values map.
    for (const { t } of resolved) {
      if (t.key === "name") row.name = d.name || "";
      else if (t.key === "email") row.email = d.email || "";
      else if (t.key === "campus") row.campus = d.campus || "";
      else { let v = mv(t.key); if (t.date) v = normDate(v); row[t.key] = v; }
    }
    row.uid = clean(d.uid) || "";
    row.exit_date = mv("exit_date") || clean(d.exit?.lastWorkingDay);
    row.reporting_manager_employee_id = mv("reporting_manager_employee_id") || (String(row.reporting_manager || "").match(/\((NW[^)]+)\)\s*$/i) || [])[1] || "";
    row.name = row.name || "";
    row.email = row.email || "";
    row.campus = row.campus || "";
    row.status = exited ? "EXITED" : "ACTIVE";
    const pctRaw = mv("primary_pct");
    const pctNum = Number(pctRaw);
    row.training = pctRaw !== "" && !isNaN(pctNum) ? pctNum : null;
    for (const key of manualValueKeys) row[key] = mv(key);
    rows.push(row);
  }

  const exited = rows.filter((r) => r.exited).length;
  const departments = [...new Set(rows.map((r) => clean(r.department)).filter(Boolean))].sort();
  return {
    ok: true,
    fetchedAt: data.fetchedAt,
    rows,
    counts: { all: rows.length, active: rows.length - exited, exited },
    darwinboxKeys: [...DARWINBOX_CORE_KEYS, ...DARWINBOX_VALUE_KEYS],
    departments,
  };
}
