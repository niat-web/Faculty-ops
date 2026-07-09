import { Instructor, ExitAlert } from "../models";
import { maybeDecrypt } from "./crypto";
import { clean, norm, normDate, TARGETS } from "./darwinboxSync";
import { getActiveMasterColumns } from "./master";
import { removedEmployeeIdSet } from "./removed";

// MONGO-BACKED Instructor Master. Rows are read DIRECTLY from MongoDB — which the hourly Darwinbox
// auto-sync (darwinboxScheduler → applyDarwinboxSync) keeps fresh. NO live Darwinbox call happens on
// a page load, so every page (Master, Exited, Org, Roles counts, Contribution, Training) serves fast
// from Mongo and keeps working even when Darwinbox is slow or down.
//
//  - Darwinbox-owned fields (name/email/campus/uid + department, designation, reporting manager, DOJ,
//    phone, qualification, gender, exit date, …) are written into Mongo by the hourly sync and are
//    surfaced here as READ-ONLY (source of truth = Darwinbox; editing them is pointless — the next
//    sync would overwrite).
//  - The FacultyOps-managed columns (contribution, hod_interaction, contribution_region, payroll_entity,
//    access_status, remarks, domain, …) live only in Mongo, are NEVER touched by the sync, and are
//    the editable ones.
//
// `refresh` forces a Darwinbox→Mongo sync BEFORE reading (used by the manual "Refresh from Darwinbox"
// button), so the grid reflects Darwinbox immediately without waiting for the hourly tick.

// The value-keys the Darwinbox sync owns (read-only). Everything a TARGET maps to, plus the derived
// reporting_manager_employee_id / exit_date. Manual FacultyOps columns are everything else.
const DARWINBOX_VALUE_KEYS = new Set<string>([
  ...TARGETS.filter((t) => t.kind === "value").map((t) => t.key),
  "reporting_manager_employee_id", "exit_date",
]);
// Core Darwinbox-owned keys (shown as read-only, sourced from Darwinbox via the sync).
const DARWINBOX_CORE_KEYS = new Set<string>(["employeeId", "name", "email", "campus", "uid"]);

// The instructor's current lifecycle stage, shown in the Master's Lifecycle column. Reflects a CM's
// finalised exit outcome when present, otherwise the plain active/exited (or in-progress) state.
function lifecycleLabel(outcome: string | undefined, exited: boolean, rawStatus?: string): string {
  if (outcome === "UNIVERSITY_PAYROLL") return "University Payroll";
  if (outcome === "CONSULTANT_REHIRE") return "Consultant → FTE";
  if (outcome === "EXITED") return "Exited";
  if (String(rawStatus || "") === "EXIT_IN_PROGRESS") return "Exit In Progress";
  return exited ? "Exited" : "Active";
}

export type LiveMasterRow = Record<string, any> & { id: string | null; employeeId: string; exited: boolean };

export type LiveMasterResult = {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  rows: LiveMasterRow[];
  counts: { all: number; active: number; exited: number };
  darwinboxKeys: string[]; // which column keys are Darwinbox-owned (read-only) — for the client
  departments: string[];   // unique department names in the set (for the department quick-filter)
};

// Departments unchecked BY DEFAULT in the Master department filter (non-teaching support depts).
// This is the built-in FALLBACK used only when an Ops Admin has not configured the list in
// Settings → Operations. When they have, the explicit set (getHiddenMasterDepartments) wins — see
// resolveDefaultUnchecked() below (used by the /master route to build `defaultUnchecked`).
export const DEFAULT_UNCHECKED_DEPT_PATTERNS = [/delivery support/i, /^\s*instructor platform/i, /product team/i];
export const isDefaultUnchecked = (dept: string) => DEFAULT_UNCHECKED_DEPT_PATTERNS.some((re) => re.test(clean(dept)));

const EXIT_STATES = new Set(["EXITED", "EXIT_IN_PROGRESS"]);
const rmid2 = (s: any) => (String(s || "").match(/\((NW[^)]+)\)/i) || [])[1] || "";
const strip2 = (s: any) => String(s || "").replace(/\s*\(NW[^)]*\)\s*$/i, "").replace(/\s+/g, " ").trim();
// Abbreviated-surname index ("Akhilendar Reddy Karri" → "akhilendar reddy k"); "" = ambiguous → unused.
const abbrevKey = (name: any): string => { const t = norm(strip2(name)).split(" ").filter(Boolean); if (t.length < 2 || !t[t.length - 1]) return ""; return [...t.slice(0, -1), t[t.length - 1][0]].join(" "); };

// Build every instructor row from MongoDB (kept fresh by the hourly Darwinbox sync).
export async function loadLiveMasterRows(refresh?: boolean): Promise<LiveMasterResult> {
  // Manual "Refresh from Darwinbox": run a sync into Mongo first, then read the fresh Mongo data.
  if (refresh) {
    try {
      const { syncDarwinboxIntoMongo } = await import("./darwinboxScheduler");
      await syncDarwinboxIntoMongo(true);
    } catch (e: any) {
      console.warn("[masterLive] refresh sync failed (serving current Mongo data):", e?.message || e);
    }
  }

  const activeCols = await getActiveMasterColumns();
  const manualValueKeys = activeCols.filter((c) => c.source === "value" && !DARWINBOX_VALUE_KEYS.has(c.key)).map((c) => c.key);
  // Every mapped value key we surface (Darwinbox-owned + manual), so the row carries all grid columns.
  const allValueKeys = new Set<string>([...DARWINBOX_VALUE_KEYS, ...manualValueKeys]);

  const docs = await Instructor.find({}).select("employeeId _id uid name email campus status exit values").lean();

  // Canonical name→id resolution for the reporting-manager column, built from EVERY instructor so a
  // bare/abbreviated manager name still resolves (matches the Org-chart CM click-through by rmid).
  const dirNameToId = new Map<string, string>();
  const abbrevToId = new Map<string, string>();
  for (const d of docs as any[]) {
    const n = norm(strip2(d.name)); const e = clean(d.employeeId);
    if (n && e && !dirNameToId.has(n)) dirNameToId.set(n, e);
    const k = abbrevKey(d.name); if (k && e) { const ex = abbrevToId.get(k); if (ex === undefined) abbrevToId.set(k, e); else if (ex && norm(ex) !== norm(e)) abbrevToId.set(k, ""); }
  }
  const nameToIdResolve = (name: any): string => { const ex = dirNameToId.get(norm(strip2(name))); if (ex) return ex; const ab = abbrevToId.get(abbrevKey(name)); return ab && ab.length ? ab : ""; };

  // Capability-Manager exit-outcome overlay: once a CM finalises an exit alert, their decision
  // overrides the stored status on this grid — "Actually exited" hides the row from Active
  // (→ Instructor Exited), while "University Payroll" / "Consultant→FTE rehire" keep them Active.
  const resolvedAlerts = await ExitAlert.find({ status: "RESOLVED" }).select("employeeId resolution resolvedAt").sort({ resolvedAt: 1 }).lean();
  const outcomeByEmp = new Map<string, string>();
  for (const a of resolvedAlerts as any[]) { const k = norm(a.employeeId); if (k && a.resolution) outcomeByEmp.set(k, a.resolution); } // later resolution wins

  // Hidden (removed) people are excluded from EVERY page that reads this loader — Master, Exited, Org
  // (incl. CM reportee counts), Contribution rollups and role counts. This is a hide, not a delete.
  const removedSet = await removedEmployeeIdSet();

  const rows: LiveMasterRow[] = [];
  const seen = new Set<string>();
  for (const d of docs as any[]) {
    const employeeId = clean(d.employeeId);
    if (!employeeId) continue;
    const empKey = norm(employeeId);
    if (seen.has(empKey)) continue; // de-dupe on Employee ID (no duplicates)
    seen.add(empKey);
    if (removedSet.has(empKey)) continue; // hidden by an admin → excluded everywhere

    const mv = (key: string) => (maybeDecrypt(d.values?.[key] ?? "") ?? "");
    let exited = EXIT_STATES.has(String(d.status || ""));
    const outcome = outcomeByEmp.get(empKey);
    if (outcome === "EXITED") exited = true;
    else if (outcome === "UNIVERSITY_PAYROLL" || outcome === "CONSULTANT_REHIRE") exited = false;

    const row: LiveMasterRow = { id: String(d._id), employeeId, exited };
    // Core fields (Darwinbox-owned) straight from the doc.
    row.name = d.name || "";
    row.email = d.email || "";
    row.campus = d.campus || "";
    row.uid = clean(d.uid) || "";
    // Every mapped value key from the values map (dates normalized).
    for (const key of allValueKeys) {
      let v = mv(key);
      if (key === "doj" || key === "exit_date") v = normDate(v);
      row[key] = v;
    }
    row.exit_date = row.exit_date || normDate(mv("exit_date")) || clean(d.exit?.lastWorkingDay);
    // Canonical Reporting Manager Employee ID (stored → "(NWxxxx)" in the name → name→id lookup).
    row.reporting_manager_employee_id = mv("reporting_manager_employee_id") || rmid2(row.reporting_manager) || nameToIdResolve(row.reporting_manager);
    row.status = exited ? "EXITED" : "ACTIVE";
    row.lifecycle = lifecycleLabel(outcome, exited, String(d.status || ""));
    // Training % quick-view: stored primary % (values.primary_pct), refreshed hourly by the
    // BigQuery → Mongo training persist (lib/trainingSync.ts). No BigQuery call on the grid.
    const pctRaw = mv("primary_pct");
    const pctNum = Number(pctRaw);
    row.training = pctRaw !== "" && !isNaN(pctNum) ? pctNum : null;

    rows.push(row);
  }

  const exited = rows.filter((r) => r.exited).length;
  const departments = [...new Set(rows.map((r) => clean(r.department)).filter(Boolean))].sort();
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    rows,
    counts: { all: rows.length, active: rows.length - exited, exited },
    darwinboxKeys: [...DARWINBOX_CORE_KEYS, ...DARWINBOX_VALUE_KEYS],
    departments,
  };
}
