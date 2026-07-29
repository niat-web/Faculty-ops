// Dashboard AI assistant (Mistral · ministral-3b-2512, tool-calling). Ops Admin / Senior Manager / Capability
// Manager only. EVERY data lookup is role-scoped: we load the caller's scoped instructor set ONCE
// (instructorScopeFilter + removed-exclusion + the same non-instructor-department gate the Master/Dashboard
// use) and all tools operate only on that in-memory set. So a Capability Manager asking "how many
// instructors" gets THEIR reportees' count — the model can't reach anyone out of scope. Read-only:
// no tool mutates data, and no SENSITIVE/encrypted field is ever read.
import { config } from "../config";
import { MoveHistory, ExitAlert, Certification, EditRequest, EditRequestBatch, Task, Instructor, User } from "../models";
import type { SessionUser } from "./rbac";
import { resolveCmScopeId, cmRowInScope } from "./cmScope";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ScopedInst = {
  _id: string; employeeId: string; name: string; status: string; campus: string; joinDate: Date | null;
  department: string; contribution: string; region: string; payroll: string; training: number | null;
  reportingManager: string; exited: boolean;
};
type TrainingInst = {
  employeeId: string; name: string; department: string; contribution: string;
  track: string | null; primaryPct: number | null; secondaryPct: number | null;
  primaryHealth: string; secondaryHealth: string; moduleStatus: Record<string, string>;
};
type Ctx = {
  user: SessionUser; scopeLabel: string; instructors: ScopedInst[];
  masterByEmp: Map<string, Record<string, any>>; _training?: Map<string, TrainingInst>;
};

// Parse the Darwinbox DOJ (real date of joining) into a LOCAL date so month grouping isn't shifted by
// timezone. Accepts yyyy-mm-dd (masterLive's normalized form) and falls back to Date.parse.
function parseJoin(doj: any): Date | null {
  const s = clean(doj);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}

const clean = (v: any) => String(v ?? "").trim();
const stripRm = (s: any) => clean(s).replace(/\s*\(NW[^)]*\)\s*$/i, "").replace(/\s+/g, " ").trim();
const norm = (s: any) => clean(s).toLowerCase();
const has = (hay: string, needle: any) => needle ? norm(hay).includes(norm(needle)) : true;
const moduleBucket = (status: string) => {
  const s = norm(status);
  if (!s) return "not_started";
  if (s.includes("complet")) return "completed";
  if (s.includes("progress")) return "in_progress";
  if (s.includes("hold")) return "on_hold";
  if (s.includes("not started")) return "not_started";
  return "other";
};

// Load the caller's scoped instructor set (the ONLY data the assistant can ever see). Uses the SAME source
// and scoping as the Instructor Master, so the assistant's numbers always match what the user sees there:
//  • loadLiveMasterRows() — the Mongo master mirror, with removed people already excluded + createdAt.
//  • the non-instructor-department gate (Delivery Support / Instructor Platform / Product Team, or the Ops
//    Admin's Settings list) so support/ops staff don't inflate counts.
//  • Capability Manager scope = ONLY instructors whose Darwinbox reporting-manager is this CM (fail closed
//    to an EMPTY set if the CM's Darwinbox id can't be resolved). Ops/SM see everyone.
export async function loadScopedContext(user: SessionUser): Promise<Ctx> {
  const { loadLiveMasterRows, isDefaultUnchecked } = await import("./masterLive");
  const { getMasterDepartments } = await import("./settings");
  const [live, deptCfg] = await Promise.all([loadLiveMasterRows(false), getMasterDepartments()]);
  const rows: any[] = live.ok ? live.rows : [];

  const hidden = new Set(deptCfg.hidden.map(norm));
  const deptExcluded = (dept: any) => { const d = clean(dept); if (!d) return false; return deptCfg.configured ? hidden.has(norm(d)) : isDefaultUnchecked(d); };

  let cmScopeId: string | null | undefined;
  if (user.role === "CAPABILITY_MANAGER") cmScopeId = await resolveCmScopeId(user);
  const inScope = (r: any) => cmRowInScope(r, cmScopeId, user.id);

  const masterByEmp = new Map<string, Record<string, any>>();
  const instructors: ScopedInst[] = [];
  for (const r of rows) {
    if (!inScope(r) || deptExcluded(r.department)) continue;
    masterByEmp.set(norm(r.employeeId), r);
    const pct = Number(r.primary_pct);
    instructors.push({
      _id: String(r.id || ""), employeeId: r.employeeId, name: r.name || "", status: String(r.status || ""),
      campus: clean(r.campus), joinDate: parseJoin(r.doj),
      department: clean(r.department), contribution: clean(r.contribution), region: clean(r.contribution_region),
      payroll: clean(r.payroll_entity), training: r.primary_pct !== "" && r.primary_pct != null && !isNaN(pct) ? pct : null,
      reportingManager: stripRm(r.reporting_manager), exited: !!r.exited,
    });
  }
  const scopeLabel = user.role === "CAPABILITY_MANAGER" ? "your reportees" : "the organization";
  return { user, scopeLabel, instructors, masterByEmp };
}

// ── Tool schema (OpenAI/Mistral function-calling format) ───────────────────────────────────────────
export const TOOLS = [
  { type: "function", function: {
    name: "instructor_counts",
    description: "Count instructors in scope, optionally filtered. Use for 'how many instructors …'. Scope is already limited to what the caller may see.",
    parameters: { type: "object", properties: {
      status: { type: "string", enum: ["active", "exited", "all"], description: "active = currently employed (default), exited = left, all = both" },
      contribution: { type: "string", description: "Contribution/batch value, e.g. 'NIAT 4 (2026)', 'NIAT 3 (2025)', 'Academy', 'Central'. Partial match ok." },
      department: { type: "string", description: "Department name, partial match." },
      campus: { type: "string", description: "Work location / campus, partial match." },
      payroll: { type: "string", enum: ["Nxtwave", "University"], description: "Payroll entity." },
      region: { type: "string", description: "Contribution region, partial match." },
      joinedMonth: { type: "string", description: "Month name (Jan..Dec) to count people who JOINED that month." },
      joinedYear: { type: ["number", "string"], description: "Year for joinedMonth (defaults to current year)." },
    } },
  } },
  { type: "function", function: {
    name: "list_instructors",
    description: "LIST instructors (with names + Employee IDs) in scope, optionally filtered — use whenever the user asks for NAMES, 'who…', 'show me the list', 'which instructors…'. Same filters as instructor_counts. Returns up to a capped number; refine filters if truncated.",
    parameters: { type: "object", properties: {
      status: { type: "string", enum: ["active", "exited", "all"], description: "active (default), exited, or all" },
      contribution: { type: "string", description: "Contribution/batch, e.g. 'NIAT 4 (2026)'. Partial match." },
      department: { type: "string", description: "Department, partial match." },
      campus: { type: "string", description: "Work location/campus, partial match." },
      payroll: { type: "string", enum: ["Nxtwave", "University"] },
      region: { type: "string", description: "Contribution region, partial match." },
      joinedMonth: { type: "string", description: "Month name (Jan..Dec) — list people who JOINED that month." },
      joinedYear: { type: ["number", "string"], description: "Year for joinedMonth (defaults to current year)." },
      limit: { type: ["number", "string"], description: "Max names to return (default 40, max 60)." },
    } },
  } },
  { type: "function", function: {
    name: "joins_by_month",
    description: "How many instructors joined per month over the last N months (default 6). Use for 'how many joined in July', trends.",
    parameters: { type: "object", properties: { months: { type: ["number", "string"], description: "Trailing months, 1-24 (default 6)." } } },
  } },
  { type: "function", function: {
    name: "upcoming_exits",
    description: "UPCOMING instructor exits = the PENDING exit alerts detected from Darwinbox (people whose last working day is approaching and still need confirmation). This is DIFFERENT from 'exited' (people who already left). Use for 'upcoming exits', 'who is leaving', 'pending exit alerts', 'how many are exiting'.",
    parameters: { type: "object", properties: { list: { type: "boolean", description: "true to also return names + last-working-day, not just the count." } } },
  } },
  { type: "function", function: {
    name: "training_summary",
    description: "Training stats for the scope: average completion %, on-track (>=76%) and at-risk (<=25%) counts.",
    parameters: { type: "object", properties: {} },
  } },
  { type: "function", function: {
    name: "breakdown",
    description: "Group the active instructors in scope by a dimension and return counts per value. Use for 'how many per contribution/department/campus/region'.",
    parameters: { type: "object", properties: { by: { type: "string", enum: ["contribution", "department", "campus", "region", "payroll", "status"], description: "Dimension to group by." } }, required: ["by"] },
  } },
  { type: "function", function: {
    name: "find_instructor",
    description: "Look up ONE instructor in scope by name or Employee ID and return a non-sensitive summary. Returns not_found if they aren't in the caller's scope.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name or Employee ID." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "move_history",
    description: "Why/when an instructor changed University or Capability Manager (team). Use for 'why did X move teams'. Returns the recorded change history.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name or Employee ID." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "darwinbox_profile",
    description: "Darwinbox HR profile for ONE instructor in scope: phone, DOJ, designation, qualification, gender, location, reporting manager, exit date. Use for 'what is X's qualification/DOJ/designation/phone'.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name or Employee ID." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "training_module_stats",
    description: "Training module completion stats in scope — count how many instructors have a given module Completed / In Progress / Not Started. Use for 'how many completed React JS', 'DSA in progress count'.",
    parameters: { type: "object", properties: {
      module: { type: "string", description: "Module name, partial match (e.g. 'React', 'DSA', 'Python')." },
      status: { type: "string", enum: ["completed", "in_progress", "on_hold", "not_started", "all"], description: "Filter by module status bucket (default all)." },
      department: { type: "string", description: "Optional department filter, partial match." },
      contribution: { type: "string", description: "Optional contribution/batch filter, partial match." },
    }, required: ["module"] },
  } },
  { type: "function", function: {
    name: "training_at_risk_list",
    description: "LIST active instructors with low training completion (primary % <= 25) or At Risk / Needs Monitoring / Overdue health status. Use for 'who is at risk', 'low training list'.",
    parameters: { type: "object", properties: {
      department: { type: "string", description: "Optional department filter." },
      contribution: { type: "string", description: "Optional contribution filter." },
      limit: { type: ["number", "string"], description: "Max rows (default 30, max 50)." },
    } },
  } },
  { type: "function", function: {
    name: "training_track_breakdown",
    description: "Count active instructors in scope per training track tab (tech, math_aptitude, english). Use for 'how many on tech track', training track distribution.",
    parameters: { type: "object", properties: {} },
  } },
  { type: "function", function: {
    name: "certification_summary",
    description: "Certification form submissions in scope — total count and breakdown by department. Use for 'how many certification submissions', 'certifications by department'. Ops Admin sees all; others see only their scoped instructors' submissions.",
    parameters: { type: "object", properties: {
      department: { type: "string", description: "Optional department filter, partial match." },
    } },
  } },
  { type: "function", function: {
    name: "certification_lookup",
    description: "Look up certification submissions for ONE instructor in scope by name or Employee ID. Returns submission dates and key answers (degree, domain, qualification).",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name or Employee ID." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "pending_requests",
    description: "Pending field-change requests visible to the caller (NOT audit logs). Use for 'how many pending requests', 'my pending requests'.",
    parameters: { type: "object", properties: { list: { type: "boolean", description: "true to return request details, not just the count." } } },
  } },
  { type: "function", function: {
    name: "open_tasks",
    description: "Open tasks assigned to (or created by) the caller. Use for 'how many open tasks', 'my tasks'. Ops Admin may pass all=true to count all open tasks.",
    parameters: { type: "object", properties: {
      list: { type: "boolean", description: "true to return task titles + due dates." },
      all: { type: "boolean", description: "Ops Admin only: count/list ALL open tasks, not just mine." },
    } },
  } },
  { type: "function", function: {
    name: "search_people",
    description: "UNIFIED people search — instructors in scope, app Users (staff accounts), AND the Darwinbox employee directory. Use FIRST when a name isn't found via find_instructor, or when the user asks 'who is X' without specifying instructor vs staff.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name, email, or employee ID (partial match ok)." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "find_user",
    description: "Look up an app User account (Ops Admin, Senior Manager, Capability Manager, Instructor login) by name or email. Returns role and account status — NOT passwords.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name or email." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "list_users",
    description: "LIST app User accounts. Ops Admin may list all or filter by role; others should pass a search query. Never returns secrets.",
    parameters: { type: "object", properties: {
      query: { type: "string", description: "Optional name/email search." },
      role: { type: "string", enum: ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"], description: "Filter by role." },
      limit: { type: ["number", "string"], description: "Max rows (default 30, max 50)." },
    } },
  } },
  { type: "function", function: {
    name: "user_counts",
    description: "Count app User accounts grouped by role (active / pending password / inactive). Use for 'how many capability managers', 'how many users'.",
    parameters: { type: "object", properties: {} },
  } },
  { type: "function", function: {
    name: "search_darwinbox",
    description: "Search the FULL Darwinbox employee directory (all departments — staff, instructors, ops). Use for people who may not be in the instructor master.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name, email, or employee ID." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "instructor_notes",
    description: "Profile notes for one instructor in scope.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name or Employee ID." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "instructor_skills",
    description: "Skills ticked on one instructor's profile in scope.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name or Employee ID." } }, required: ["query"] },
  } },
  { type: "function", function: {
    name: "org_capability_managers",
    description: "Capability Managers from the org chart with live Darwinbox reportee counts.",
    parameters: { type: "object", properties: { limit: { type: ["number", "string"], description: "Max rows (default 40)." } } },
  } },
] as const;

// ── Tool execution (pure functions over the pre-scoped set) ─────────────────────────────────────────
function activeSet(ctx: Ctx) { return ctx.instructors.filter((i) => !i.exited); }
function pick(ctx: Ctx, query: string): ScopedInst | null {
  const q = norm(query);
  if (!q) return null;
  const exact = ctx.instructors.find((i) => norm(i.employeeId) === q)
    || ctx.instructors.find((i) => norm(i.name) === q);
  if (exact) return exact;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const multi = ctx.instructors.find((i) => words.every((w) => norm(i.name).includes(w)));
    if (multi) return multi;
  }
  return ctx.instructors.find((i) => norm(i.name).includes(q) || norm(i.employeeId).includes(q)) || null;
}

function userOut(u: any) {
  return {
    name: u.name, email: u.email, role: u.role,
    active: u.active !== false,
    accountStatus: u.active === false ? "Inactive" : u.mustSetPassword ? "Pending password" : "Active",
    lastLoginAt: u.lastLoginAt || null,
    lastSeenAt: u.lastSeenAt || null,
  };
}

async function findUsers(query: string, limit = 10, role?: string) {
  const { escapeRegex } = await import("./text");
  const { removedEmailList } = await import("./removed");
  const removed = new Set((await removedEmailList()).map((e) => norm(e)));
  const filter: any = {};
  if (role) filter.role = role;
  const q = clean(query);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const rows = await User.find(filter).select("name email role active mustSetPassword lastLoginAt lastSeenAt").sort({ name: 1 }).limit(limit).lean();
  return (rows as any[]).filter((u) => !removed.has(norm(u.email)));
}

// Shared filter used by instructor_counts + list_instructors (same args → same population).
function filterInstructors(ctx: Ctx, args: any): ScopedInst[] {
  let set = args.status === "all" ? ctx.instructors : args.status === "exited" ? ctx.instructors.filter((i) => i.exited) : activeSet(ctx);
  if (args.contribution) set = set.filter((i) => has(i.contribution, args.contribution));
  if (args.department) set = set.filter((i) => has(i.department, args.department));
  if (args.campus) set = set.filter((i) => has(i.campus, args.campus));
  if (args.payroll) set = set.filter((i) => norm(i.payroll) === norm(args.payroll));
  if (args.region) set = set.filter((i) => has(i.region, args.region));
  if (args.joinedMonth) {
    const mi = MONTHS.findIndex((m) => norm(m) === norm(String(args.joinedMonth).slice(0, 3)));
    const yr = Number(args.joinedYear) || new Date().getFullYear();
    if (mi >= 0) set = set.filter((i) => i.joinDate && i.joinDate.getMonth() === mi && i.joinDate.getFullYear() === yr);
  }
  return set;
}

function darwinboxBlock(row: Record<string, any> | undefined) {
  if (!row) return {};
  const raw: Record<string, string | undefined> = {
    email: clean(row.email), phone: clean(row.phone), doj: clean(row.doj), department: clean(row.department),
    designation: clean(row.designation), qualification: clean(row.qualification), gender: clean(row.gender),
    nativeLanguage: clean(row.native_language), state: clean(row.emp_state), city: clean(row.emp_city),
    district: clean(row.emp_district), workspace: clean(row.workspace),
    reportingManager: stripRm(row.reporting_manager), exitDate: clean(row.exit_date),
  };
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v));
}

function scopedEmpIds(ctx: Ctx) { return new Set(activeSet(ctx).map((i) => norm(i.employeeId))); }

async function ensureTraining(ctx: Ctx): Promise<Map<string, TrainingInst>> {
  if (ctx._training) return ctx._training;
  const { TrainingColumn } = await import("../models");
  const { seedTrainingColumns, tabForInstructor } = await import("./training");
  const { computeSummary, summaryStored } = await import("./trainingScore");
  await seedTrainingColumns();
  const cols = await TrainingColumn.find({ archivedAt: null }).sort({ track: 1, order: 1 }).lean();
  const liveTrackKeys: Record<string, string[]> = {};
  for (const c of cols as any[]) if (c.storage === "module") (liveTrackKeys[c.track] ||= []).push(c.key);

  const active = activeSet(ctx);
  const empIds = active.map((i) => i.employeeId).filter(Boolean);
  const docs = empIds.length ? await Instructor.find({ employeeId: { $in: empIds } }).select("employeeId name values moduleStatus").lean() : [];
  const instByEmp = Object.fromEntries(active.map((i) => [norm(i.employeeId), i]));
  const map = new Map<string, TrainingInst>();
  for (const d of docs as any[]) {
    const key = norm(d.employeeId);
    const inst = instByEmp[key];
    if (!inst) continue;
    const values = d.values || {};
    const ms = Object.fromEntries(Object.entries(d.moduleStatus || {}).map(([k, v]) => [k, String(v ?? "")]));
    const track = tabForInstructor(values, ms, liveTrackKeys);
    if (!track) continue;
    const stored = summaryStored(computeSummary(values, ms, track));
    const primaryPct = stored.primary_pct !== "" ? Number(stored.primary_pct) : null;
    const secondaryPct = stored.secondary_pct !== "" ? Number(stored.secondary_pct) : null;
    map.set(key, {
      employeeId: d.employeeId, name: inst.name || d.name || "", department: inst.department, contribution: inst.contribution,
      track, primaryPct: primaryPct != null && !isNaN(primaryPct) ? primaryPct : null,
      secondaryPct: secondaryPct != null && !isNaN(secondaryPct) ? secondaryPct : null,
      primaryHealth: stored.health_status || "", secondaryHealth: stored.secondary_health_status || "",
      moduleStatus: ms,
    });
  }
  ctx._training = map;
  return map;
}

function certAnswers(c: any): Record<string, string> {
  const legacy: Record<string, string> = {};
  for (const k of ["fullName", "email", "department", "capabilityManagerName", "degreeType", "highestQualification", "domain", "yearOfPassing"]) {
    if (c[k]) legacy[k] = String(c[k]);
  }
  const ans = c.answers instanceof Map ? Object.fromEntries(c.answers.entries()) : (c.answers || {});
  return { ...legacy, ...ans };
}

async function scopedCertifications(ctx: Ctx) {
  const empIds = scopedEmpIds(ctx);
  const rows = await Certification.find().sort({ createdAt: -1 }).limit(5000).lean();
  return (rows as any[]).filter((c) => {
    const e = norm(c.employeeId);
    if (!e || e === "na") return ctx.user.role === "OPS_ADMIN";
    return empIds.has(e);
  });
}

export async function runTool(name: string, args: any, ctx: Ctx): Promise<any> {
  switch (name) {
    case "instructor_counts": {
      return { count: filterInstructors(ctx, args).length, scope: ctx.scopeLabel, filters: args };
    }
    case "list_instructors": {
      const set = filterInstructors(ctx, args).slice().sort((a, b) => a.name.localeCompare(b.name));
      const limit = Math.min(60, Math.max(1, Number(args.limit) || 40));
      const rows = set.slice(0, limit).map((i) => ({ name: i.name, employeeId: i.employeeId, department: i.department, campus: i.campus, status: i.exited ? "Exited" : "Active", contribution: i.contribution, trainingPct: i.training }));
      return { total: set.length, returned: rows.length, truncated: set.length > rows.length, instructors: rows, scope: ctx.scopeLabel,
        note: set.length > rows.length ? `Showing ${rows.length} of ${set.length}. Ask the user to narrow by department/contribution/campus to see more.` : undefined };
    }
    case "joins_by_month": {
      const months = Math.min(24, Math.max(1, Number(args.months) || 6));
      const now = new Date(); const out: { month: string; year: number; count: number }[] = [];
      for (let k = months - 1; k >= 0; k--) {
        const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const count = ctx.instructors.filter((i) => i.joinDate && i.joinDate >= d && i.joinDate < next).length;
        out.push({ month: MONTHS[d.getMonth()], year: d.getFullYear(), count });
      }
      return { series: out, scope: ctx.scopeLabel };
    }
    case "upcoming_exits": {
      // Pending exit alerts — scoped to the caller's instructors (Darwinbox + app assignment for CMs).
      const filter: any = { status: "PENDING" };
      let rows = await ExitAlert.find(filter).sort({ exitDate: 1 }).limit(100).lean();
      if (ctx.user.role === "CAPABILITY_MANAGER") {
        const empIds = new Set(ctx.instructors.map((i) => norm(i.employeeId)));
        rows = (rows as any[]).filter((a) => empIds.has(norm(a.employeeId)) || String(a.managerId) === ctx.user.id);
      }
      // Count PEOPLE, not alert records: one person can have >1 pending alert (e.g. a changed exit date).
      // Keep the earliest (most imminent) exit per person — rows are sorted by exitDate ascending.
      const byEmp = new Map<string, any>();
      for (const a of rows as any[]) if (!byEmp.has(a.employeeId)) byEmp.set(a.employeeId, a);
      const people = [...byEmp.values()];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const inDays = (d: string) => { const dt = parseJoin(d); return dt ? Math.round((dt.getTime() - today.getTime()) / 86400000) : null; };
      return {
        count: people.length, alertRecords: rows.length, scope: ctx.scopeLabel,
        upcomingExits: people.map((a) => ({ name: a.name, employeeId: a.employeeId, department: a.department, lastWorkingDay: a.exitDate, inDays: inDays(a.exitDate) })),
      };
    }
    case "training_summary": {
      const set = activeSet(ctx);
      const vals = set.map((i) => i.training).filter((n): n is number => n != null);
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return { averageTrainingPct: avg, onTrack: vals.filter((v) => v >= 76).length, atRisk: vals.filter((v) => v <= 25).length, withData: vals.length, scope: ctx.scopeLabel };
    }
    case "breakdown": {
      const set = activeSet(ctx);
      const key = (i: ScopedInst) => args.by === "contribution" ? i.contribution : args.by === "department" ? i.department : args.by === "campus" ? i.campus : args.by === "region" ? i.region : args.by === "payroll" ? i.payroll : i.status;
      const map: Record<string, number> = {};
      for (const i of set) { const k = key(i) || "(none)"; map[k] = (map[k] || 0) + 1; }
      return { by: args.by, groups: Object.entries(map).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count), scope: ctx.scopeLabel };
    }
    case "find_instructor": {
      const i = pick(ctx, args.query);
      if (!i) return { found: false, note: "Not found among instructors in your scope. Try search_people to also check app Users and the Darwinbox directory." };
      const row = ctx.masterByEmp.get(norm(i.employeeId));
      return { found: true, instructor: { name: i.name, employeeId: i.employeeId, department: i.department, campus: i.campus, status: i.exited ? "Exited" : "Active", contribution: i.contribution, region: i.region, payroll: i.payroll, trainingPct: i.training, reportingManager: i.reportingManager, darwinbox: darwinboxBlock(row) } };
    }
    case "move_history": {
      const i = pick(ctx, args.query);
      if (!i) return { found: false, note: "Not found in your scope." };
      const hist = await MoveHistory.find({ instructorId: i._id }).sort({ createdAt: -1 }).limit(20).lean();
      if (!hist.length) return { found: true, name: i.name, changes: [], note: "No team/university reassignments recorded for this instructor." };
      return { found: true, name: i.name, changes: (hist as any[]).map((h) => ({
        when: h.createdAt, by: h.actorName || "System", note: h.note || "",
        university: h.universityFrom || h.universityTo ? { from: h.universityFrom || "—", to: h.universityTo || "—" } : undefined,
        capabilityManager: h.managerFrom || h.managerTo ? { from: h.managerFrom || "—", to: h.managerTo || "—" } : undefined,
      })) };
    }
    case "darwinbox_profile": {
      const i = pick(ctx, args.query);
      if (!i) return { found: false, note: "Not found in your scope." };
      const row = ctx.masterByEmp.get(norm(i.employeeId));
      const db = darwinboxBlock(row);
      if (!Object.keys(db).length) return { found: true, name: i.name, employeeId: i.employeeId, note: "No Darwinbox profile fields stored for this person yet (may sync on the next hourly update)." };
      return { found: true, name: i.name, employeeId: i.employeeId, darwinbox: db, scope: ctx.scopeLabel };
    }
    case "training_module_stats": {
      const training = await ensureTraining(ctx);
      const modNeedle = norm(args.module);
      if (!modNeedle) return { error: "module name is required." };
      const statusFilter = args.status && args.status !== "all" ? String(args.status) : null;
      let matched = 0;
      const buckets: Record<string, number> = { completed: 0, in_progress: 0, on_hold: 0, not_started: 0, other: 0 };
      const moduleKeys = new Set<string>();
      for (const t of training.values()) {
        if (args.department && !has(t.department, args.department)) continue;
        if (args.contribution && !has(t.contribution, args.contribution)) continue;
        const hit = Object.entries(t.moduleStatus).find(([k]) => norm(k).includes(modNeedle));
        if (!hit) continue;
        moduleKeys.add(hit[0]);
        const bucket = moduleBucket(hit[1]);
        buckets[bucket] = (buckets[bucket] || 0) + 1;
        if (!statusFilter || bucket === statusFilter) matched++;
      }
      return {
        moduleQuery: args.module, matchedModules: [...moduleKeys].slice(0, 5), count: matched, breakdown: buckets,
        statusFilter: statusFilter || "all", instructorsWithTrainingRows: training.size, scope: ctx.scopeLabel,
        note: !moduleKeys.size ? `No module matching "${args.module}" found in scope.` : undefined,
      };
    }
    case "training_at_risk_list": {
      const training = await ensureTraining(ctx);
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 30));
      const risky = [...training.values()].filter((t) => {
        if (args.department && !has(t.department, args.department)) return false;
        if (args.contribution && !has(t.contribution, args.contribution)) return false;
        const low = t.primaryPct != null && t.primaryPct <= 25;
        const health = norm(t.primaryHealth);
        const badHealth = health.includes("risk") || health.includes("overdue") || health.includes("monitoring");
        return low || badHealth;
      }).sort((a, b) => (a.primaryPct ?? 0) - (b.primaryPct ?? 0));
      const rows = risky.slice(0, limit).map((t) => ({
        name: t.name, employeeId: t.employeeId, department: t.department, track: t.track,
        primaryPct: t.primaryPct, health: t.primaryHealth || "—",
      }));
      return { total: risky.length, returned: rows.length, truncated: risky.length > rows.length, instructors: rows, scope: ctx.scopeLabel };
    }
    case "training_track_breakdown": {
      const training = await ensureTraining(ctx);
      const map: Record<string, number> = { tech: 0, math_aptitude: 0, english: 0, other: 0 };
      for (const t of training.values()) {
        const k = t.track && map[t.track] != null ? t.track : "other";
        map[k] = (map[k] || 0) + 1;
      }
      return { tracks: Object.entries(map).map(([track, count]) => ({ track, count })).sort((a, b) => b.count - a.count), withTrainingRows: training.size, scope: ctx.scopeLabel };
    }
    case "certification_summary": {
      const rows = await scopedCertifications(ctx);
      const filtered = args.department ? rows.filter((c) => has(certAnswers(c).department || c.department || "", args.department)) : rows;
      const byDept: Record<string, number> = {};
      for (const c of filtered) {
        const d = clean(certAnswers(c).department || c.department) || "(unknown)";
        byDept[d] = (byDept[d] || 0) + 1;
      }
      const thirtyAgo = Date.now() - 30 * 86400000;
      const recent = filtered.filter((c) => new Date(c.createdAt).getTime() >= thirtyAgo).length;
      return {
        total: filtered.length, last30Days: recent, scope: ctx.scopeLabel,
        byDepartment: Object.entries(byDept).map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count).slice(0, 15),
      };
    }
    case "certification_lookup": {
      const i = pick(ctx, args.query);
      if (!i) return { found: false, note: "Not found in your scope." };
      const rows = (await scopedCertifications(ctx)).filter((c) => norm(c.employeeId) === norm(i.employeeId));
      if (!rows.length) return { found: true, name: i.name, employeeId: i.employeeId, submissions: [], note: "No certification submissions for this person." };
      const submissions = rows.slice(0, 10).map((c) => {
        const a = certAnswers(c);
        return {
          submittedAt: c.createdAt,
          department: a.department || c.department || "",
          degreeType: a.degreeType || a.degree_type || "",
          highestQualification: a.highestQualification || a.highest_qualification || "",
          domain: a.domain || "",
          yearOfPassing: a.yearOfPassing || a.year_of_passing || "",
        };
      });
      return { found: true, name: i.name, employeeId: i.employeeId, count: rows.length, submissions, scope: ctx.scopeLabel };
    }
    case "pending_requests": {
      const { requestsListScope } = await import("./requestScope");
      const scope = requestsListScope(ctx.user, "PENDING");
      if (!scope) return { count: 0, scope: ctx.scopeLabel };
      const [reqCount, batchCount] = await Promise.all([
        EditRequest.countDocuments(scope.q),
        EditRequestBatch.countDocuments(scope.bq),
      ]);
      const out: any = { count: reqCount + batchCount, individualRequests: reqCount, batches: batchCount, scope: ctx.scopeLabel };
      if (args.list) {
        const [reqs, batches] = await Promise.all([
          EditRequest.find(scope.q).sort({ createdAt: -1 }).limit(15).lean(),
          EditRequestBatch.find(scope.bq).sort({ createdAt: -1 }).limit(10).lean(),
        ]);
        out.requests = (reqs as any[]).map((r) => ({ instructorName: r.instructorName, field: r.fieldLabel, requester: r.requesterName, createdAt: r.createdAt }));
        out.batchRequests = (batches as any[]).map((b) => ({ requester: b.requesterName, itemCount: (b.items || []).length, createdAt: b.createdAt }));
      }
      return out;
    }
    case "open_tasks": {
      const filter: Record<string, any> = { status: "OPEN" };
      if (ctx.user.role === "OPS_ADMIN" && args.all) {
        // all open tasks in the system
      } else {
        filter.$or = [{ assigneeId: ctx.user.id }, { assignerId: ctx.user.id }];
      }
      const count = await Task.countDocuments(filter);
      const out: any = { count, scope: ctx.user.role === "OPS_ADMIN" && args.all ? "all open tasks" : "your tasks", mine: !(ctx.user.role === "OPS_ADMIN" && args.all) };
      if (args.list) {
        const rows = await Task.find(filter).sort({ dueAt: 1, createdAt: -1 }).limit(20).lean();
        out.tasks = (rows as any[]).map((t) => ({
          title: t.title, dueAt: t.dueAt, priority: t.priority || "MEDIUM",
          assignee: t.assigneeName, assigner: t.assignerName, status: t.status,
        }));
      }
      return out;
    }
    case "search_people": {
      const q = clean(args.query);
      if (!q) return { error: "query is required." };
      const nq = norm(q);
      const words = nq.split(/\s+/).filter(Boolean);
      const instAll = ctx.instructors.filter((i) => {
        const nn = norm(i.name);
        const ne = norm(i.employeeId);
        if (nn.includes(nq) || ne.includes(nq)) return true;
        return words.length > 1 && words.every((w) => nn.includes(w));
      }).slice(0, 10).map((i) => ({ kind: "instructor", name: i.name, employeeId: i.employeeId, department: i.department, status: i.exited ? "Exited" : "Active" }));
      const users = (await findUsers(q, 10)).map((u) => ({ kind: "app_user", ...userOut(u) }));
      const { searchDarwinbox } = await import("./staffRoles");
      const dbx = (await searchDarwinbox(q, 10)).map((p) => ({ kind: "darwinbox", name: p.name, employeeId: p.employeeId, email: p.email, department: p.department, designation: p.designation }));
      return { query: q, instructors: instAll, users, darwinbox: dbx, scope: ctx.scopeLabel,
        note: !instAll.length && !users.length && !dbx.length ? "No matches in instructors, Users, or Darwinbox." : undefined };
    }
    case "find_user": {
      const rows = await findUsers(clean(args.query), 5);
      if (!rows.length) return { found: false, note: "No app User account matches that name or email." };
      if (rows.length === 1) return { found: true, user: userOut(rows[0]) };
      return { found: true, multiple: true, users: rows.map(userOut) };
    }
    case "list_users": {
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 30));
      if (ctx.user.role !== "OPS_ADMIN" && !clean(args.query) && !args.role) {
        return { error: "Provide a search query or role filter to list users." };
      }
      const rows = await findUsers(clean(args.query || ""), limit, args.role || undefined);
      return { total: rows.length, returned: rows.length, users: rows.map(userOut), scope: ctx.user.role === "OPS_ADMIN" ? "all app users" : "search results" };
    }
    case "user_counts": {
      const { removedEmailList } = await import("./removed");
      const removed = new Set((await removedEmailList()).map((e) => norm(e)));
      const rows = (await User.find({}).select("role active mustSetPassword email").lean()).filter((u: any) => !removed.has(norm(u.email)));
      const byRole: Record<string, { total: number; active: number; pending: number; inactive: number }> = {};
      for (const u of rows as any[]) {
        const r = u.role || "(unknown)";
        if (!byRole[r]) byRole[r] = { total: 0, active: 0, pending: 0, inactive: 0 };
        byRole[r].total++;
        if (u.active === false) byRole[r].inactive++;
        else if (u.mustSetPassword) byRole[r].pending++;
        else byRole[r].active++;
      }
      return { totalUsers: rows.length, byRole: Object.entries(byRole).map(([role, c]) => ({ role, ...c })).sort((a, b) => b.total - a.total) };
    }
    case "search_darwinbox": {
      const q = clean(args.query);
      if (!q) return { error: "query is required." };
      const { searchDarwinbox } = await import("./staffRoles");
      const items = await searchDarwinbox(q, 15);
      return { query: q, count: items.length, people: items.map((p) => ({ name: p.name, employeeId: p.employeeId, email: p.email, department: p.department, designation: p.designation })) };
    }
    case "instructor_notes": {
      const i = pick(ctx, args.query);
      if (!i?._id) return { found: false, note: "Instructor not found in your scope." };
      const doc: any = await Instructor.findById(i._id).select("notes").lean();
      const notes = (doc?.notes || []).slice(-20).map((n: any) => ({ body: n.body, author: n.authorName || "Unknown", when: n.createdAt }));
      return { found: true, name: i.name, employeeId: i.employeeId, count: notes.length, notes };
    }
    case "instructor_skills": {
      const i = pick(ctx, args.query);
      if (!i?._id) return { found: false, note: "Instructor not found in your scope." };
      const doc: any = await Instructor.findById(i._id).select("skills").lean();
      const skills = Object.entries(doc?.skills || {}).filter(([, v]) => v).map(([k]) => k).sort();
      return { found: true, name: i.name, employeeId: i.employeeId, skills, count: skills.length };
    }
    case "org_capability_managers": {
      const { getReportingManagers } = await import("./staffRoles");
      const limit = Math.min(60, Math.max(1, Number(args.limit) || 40));
      const cms = await getReportingManagers();
      return { count: cms.length, returned: Math.min(limit, cms.length), managers: cms.slice(0, limit).map((m) => ({ name: m.name, managerEmployeeId: m.managerId, reporteeCount: m.count })) };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Mistral chat loop ───────────────────────────────────────────────────────────────────────────────
const SYSTEM = (ctx: Ctx) => `You are the FacultyOps assistant, a friendly, concise helper embedded in an instructor-lifecycle CRM.
The signed-in user is a ${ctx.user.role.replace("_", " ").toLowerCase()}. Every data tool is ALREADY scoped to exactly the data they may see (${ctx.scopeLabel}).
You are READ-ONLY: you can only look up and DISPLAY data. You cannot add, edit, delete, move, or change anything — if asked to, politely say you can only show information, and point them to the relevant page.

Respond to what the user actually said:
- GREETINGS or small talk (e.g. "hi", "hello", "thanks", "how are you") → reply briefly and warmly WITHOUT calling any tool, and offer 1–2 example questions they can ask. Do NOT return a count or list for a greeting.
- Vague/unclear messages → ask a short clarifying question; don't guess a data query.
- Only call a data tool when the user actually asks a DATA question (counts, names/lists, stats, joins, a specific person, why someone moved teams).

When you DO answer with data:
- Use the tools — never invent numbers or names, and don't claim anything beyond tool results.
- Give what they ASKED FOR: for "names / who / list / show me" call list_instructors and actually list the names (with Employee IDs); give a bare count only when they asked for a count. If a list is truncated, show what you got, state the total, and suggest narrowing the filter.
- IMPORTANT distinction: "UPCOMING exits" / "who is leaving" / "pending exit alerts" → use upcoming_exits (the pending Darwinbox exit alerts, usually a small number). "EXITED" / "how many left / already exited" → use instructor_counts with status=exited. Never answer "upcoming exits" with the exited count.
- TRAINING questions: use training_summary for averages/on-track/at-risk counts; training_module_stats for a specific module (React, DSA, Python…); training_at_risk_list for WHO is low/at-risk; training_track_breakdown for tech vs math vs english tabs. Data comes from stored Mongo training stats (same as Training Stats page), not live BigQuery.
- DARWINBOX / HR profile questions (qualification, DOJ, phone, designation, gender, location): use darwinbox_profile or find_instructor (which includes darwinbox fields). Data is synced hourly from Darwinbox into Mongo.
- CERTIFICATION questions: use certification_summary for totals/by department; certification_lookup for one person's submissions.
- REQUESTS / TASKS: use pending_requests for pending field-change requests; open_tasks for open tasks assigned to or created by the caller.
- USERS / STAFF: use find_user, list_users, or user_counts for app login accounts (Ops Admin, Senior Manager, Capability Manager, Instructor). use search_people or search_darwinbox when a name might be staff OR instructor — search_people checks all three sources at once.
- PROFILE extras: instructor_notes and instructor_skills for one instructor; org_capability_managers for CM list + reportee counts.
- AUDIT LOGS are NOT available — never claim audit/history-of-all-changes data. Everything else in FacultyOps (instructors, training, Darwinbox, certifications, users, requests, tasks, exits, org) IS available via tools.
- When a person isn't found as an instructor, call search_people before saying they don't exist.
- If the data or person isn't in scope, say so plainly and suggest the owner/source. Never fabricate.
- If the user is a capability manager, everything is THEIR reportees only — say "your reportees", not "the whole org".
Keep answers clear and short. Format every reply in Markdown so the UI can render it nicely:
- **Bold** for labels, campus names, counts, and key terms.
- Bullet lists (\`- item\`) for breakdowns, name lists, and multi-row stats.
- Numbered lists for ranked or step-by-step answers.
- Markdown tables (\`| col | col |\`) when comparing 3+ rows with multiple columns.
- \`inline code\` for employee IDs or field names when helpful.
- Short paragraphs; use \`---\` only between clearly separate sections.`;

type Msg = { role: string; content?: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string };

export async function askAssistant(user: SessionUser, userMessages: { role: string; content: string }[]): Promise<{ ok: boolean; answer?: string; error?: string; toolsUsed?: string[] }> {
  if (!config.mistral.apiKey) return { ok: false, error: "The assistant isn't configured yet (missing MISTRAL_API_KEY). Ask an administrator to set it up." };
  const ctx = await loadScopedContext(user);

  // Keep only the last ~8 turns of user/assistant text (bound tokens).
  const history = userMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-8)
    .map((m) => ({
      role: m.role,
      content: m.role === "assistant"
        ? String(m.content || "").slice(0, 2000).replace(/<function[=([]/gi, "")
        : String(m.content || "").slice(0, 2000),
    }));
  const messages: Msg[] = [{ role: "system", content: SYSTEM(ctx) }, ...history];
  const toolsUsed: string[] = [];

  const TOOL_NAMES = new Set<string>(TOOLS.map((t) => t.function.name));
  for (let step = 0; step < 8; step++) {
    const res = await callMistral(messages);
    if (!res.ok) return { ok: false, error: res.error };
    const msg = res.message;
    messages.push(msg);
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { args = {}; }
        toolsUsed.push(tc.function?.name);
        let result: any;
        try { result = await runTool(tc.function?.name, args, ctx); }
        catch (e: any) { result = { error: e?.message || "tool failed" }; }
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function?.name, content: JSON.stringify(result).slice(0, 6000) });
      }
      continue; // let the model read the tool results
    }

    // Recovery for models that sometimes write a tool call as TEXT in `content`
    // (e.g. <function=upcoming_exits>{"list":true}</function>) instead of the structured tool_calls
    // field. Detect that, execute the tool for real, and continue — so it never leaks to the user.
    const raw = String(msg.content || "");
    const fm = raw.match(/<function[=(]\s*([a-zA-Z_]+)\s*\)?\s*>?\s*(\{[\s\S]*?\})?/);
    if (fm && TOOL_NAMES.has(fm[1])) {
      let args: any = {};
      try { args = fm[2] ? JSON.parse(fm[2]) : {}; } catch { args = {}; }
      toolsUsed.push(fm[1]);
      let result: any;
      try { result = await runTool(fm[1], args, ctx); } catch (e: any) { result = { error: e?.message || "tool failed" }; }
      messages.pop(); // drop the malformed assistant text
      messages.push({ role: "assistant", content: null, tool_calls: [{ id: "recovered", type: "function", function: { name: fm[1], arguments: JSON.stringify(args) } }] });
      messages.push({ role: "tool", tool_call_id: "recovered", name: fm[1], content: JSON.stringify(result).slice(0, 6000) });
      continue;
    }

    return { ok: true, answer: raw.trim() || "I couldn't produce an answer.", toolsUsed: [...new Set(toolsUsed)] };
  }
  return { ok: true, answer: "That took too many steps — please rephrase or ask something more specific.", toolsUsed: [...new Set(toolsUsed)] };
}

async function callMistral(messages: Msg[]): Promise<{ ok: true; message: Msg } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${config.mistral.baseUrl}/chat/completions`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.mistral.apiKey}` },
      body: JSON.stringify({ model: config.mistral.model, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 800 }),
    });
    const text = await res.text();
    if (!res.ok) { console.error("[assistant] mistral error", res.status, text.slice(0, 300)); return { ok: false, error: res.status === 429 ? "The assistant is busy (rate limit) — try again in a moment." : "The assistant is temporarily unavailable." }; }
    const data = JSON.parse(text);
    const message = data?.choices?.[0]?.message;
    if (!message) return { ok: false, error: "The assistant returned an empty response." };
    return { ok: true, message };
  } catch (e: any) {
    console.error("[assistant] call failed:", e?.message || e);
    return { ok: false, error: e?.name === "AbortError" ? "The assistant timed out — please try again." : "The assistant is temporarily unavailable." };
  } finally { clearTimeout(timer); }
}
