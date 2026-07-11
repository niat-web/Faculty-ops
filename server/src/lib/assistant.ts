// Dashboard AI assistant (Groq · Llama-3.3-70B, tool-calling). Ops Admin / Senior Manager / Capability
// Manager only. EVERY data lookup is role-scoped: we load the caller's scoped instructor set ONCE
// (instructorScopeFilter + removed-exclusion + the same non-instructor-department gate the Master/Dashboard
// use) and all tools operate only on that in-memory set. So a Capability Manager asking "how many
// instructors" gets THEIR reportees' count — the model can't reach anyone out of scope. Read-only:
// no tool mutates data, and no SENSITIVE/encrypted field is ever read.
import { config } from "../config";
import { MoveHistory, ExitAlert } from "../models";
import type { SessionUser } from "./rbac";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Only NON-sensitive value keys are ever surfaced (never encrypted SENSITIVE fields).
const SAFE_VALUE_KEYS = ["department", "contribution", "contribution_region", "payroll_entity", "primary_pct", "reporting_manager", "reporting_manager_employee_id", "workspace"];

type ScopedInst = {
  _id: string; employeeId: string; name: string; status: string; campus: string; joinDate: Date | null;
  department: string; contribution: string; region: string; payroll: string; training: number | null;
  reportingManager: string; exited: boolean;
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
type Ctx = { user: SessionUser; scopeLabel: string; instructors: ScopedInst[] };

const clean = (v: any) => String(v ?? "").trim();
const stripRm = (s: any) => clean(s).replace(/\s*\(NW[^)]*\)\s*$/i, "").replace(/\s+/g, " ").trim();
const norm = (s: any) => clean(s).toLowerCase();

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
  const { cmDarwinboxEmployeeId } = await import("./staffRoles");
  const [live, deptCfg] = await Promise.all([loadLiveMasterRows(false), getMasterDepartments()]);
  const rows: any[] = live.ok ? live.rows : [];

  const hidden = new Set(deptCfg.hidden.map(norm));
  const deptExcluded = (dept: any) => { const d = clean(dept); if (!d) return false; return deptCfg.configured ? hidden.has(norm(d)) : isDefaultUnchecked(d); };

  // Capability Manager scoping — mirror the Master exactly (reporting_manager_employee_id === CM's DB id).
  let cmScopeId: string | null | undefined; // undefined = not a CM (no scoping)
  if (user.role === "CAPABILITY_MANAGER") cmScopeId = await cmDarwinboxEmployeeId(user);
  const inScope = (r: any) => cmScopeId === undefined ? true : (!!cmScopeId && norm(r.reporting_manager_employee_id) === norm(cmScopeId));

  const instructors: ScopedInst[] = rows
    .filter((r) => inScope(r) && !deptExcluded(r.department))
    .map((r) => {
      const pct = Number(r.primary_pct);
      return {
        _id: String(r.id || ""), employeeId: r.employeeId, name: r.name || "", status: String(r.status || ""),
        campus: clean(r.campus), joinDate: parseJoin(r.doj), // real Date of Joining (Darwinbox), not the DB import date
        department: clean(r.department), contribution: clean(r.contribution), region: clean(r.contribution_region),
        payroll: clean(r.payroll_entity), training: r.primary_pct !== "" && r.primary_pct != null && !isNaN(pct) ? pct : null,
        reportingManager: stripRm(r.reporting_manager), exited: !!r.exited,
      };
    });
  const scopeLabel = user.role === "CAPABILITY_MANAGER" ? "your reportees" : "the organization";
  return { user, scopeLabel, instructors };
}

// ── Tool schema (OpenAI/Groq function-calling format) ───────────────────────────────────────────────
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
] as const;

// ── Tool execution (pure functions over the pre-scoped set) ─────────────────────────────────────────
function activeSet(ctx: Ctx) { return ctx.instructors.filter((i) => !i.exited); }
function pick(ctx: Ctx, query: string): ScopedInst | null {
  const q = norm(query);
  if (!q) return null;
  return ctx.instructors.find((i) => norm(i.employeeId) === q)
    || ctx.instructors.find((i) => norm(i.name) === q)
    || ctx.instructors.find((i) => norm(i.name).includes(q) || norm(i.employeeId).includes(q))
    || null;
}

// Shared filter used by instructor_counts + list_instructors (same args → same population).
function filterInstructors(ctx: Ctx, args: any): ScopedInst[] {
  const has = (hay: string, needle: any) => needle ? norm(hay).includes(norm(needle)) : true;
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
      // Pending exit alerts, scoped like the dashboard banner: Ops/SM see all PENDING; a CM sees only
      // their reportees' alerts (managerId).
      const filter: any = { status: "PENDING" };
      if (ctx.user.role === "CAPABILITY_MANAGER") filter.managerId = ctx.user.id;
      const rows = await ExitAlert.find(filter).sort({ exitDate: 1 }).limit(100).lean();
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
      if (!i) return { found: false, note: "Not found in your scope. If this person exists, they may report to a different manager (ask the Ops team)." };
      return { found: true, instructor: { name: i.name, employeeId: i.employeeId, department: i.department, campus: i.campus, status: i.exited ? "Exited" : "Active", contribution: i.contribution, region: i.region, payroll: i.payroll, trainingPct: i.training, reportingManager: i.reportingManager } };
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
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Groq chat loop ──────────────────────────────────────────────────────────────────────────────────
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
- This assistant covers INSTRUCTORS only — no staff/Ops-team/User-account data. If asked about the "Ops team" or other staff, say that's not available here and to check Settings → Users.
- If the data or person isn't in scope, say so plainly and suggest the owner/source. Never fabricate.
- If the user is a capability manager, everything is THEIR reportees only — say "your reportees", not "the whole org".
Keep answers clear and short. Plain lists (comma-separated or bulleted) are fine.`;

type Msg = { role: string; content?: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string };

export async function askAssistant(user: SessionUser, userMessages: { role: string; content: string }[]): Promise<{ ok: boolean; answer?: string; error?: string; toolsUsed?: string[] }> {
  if (!config.groq.apiKey) return { ok: false, error: "The assistant isn't configured yet (missing GROQ_API_KEY). Ask an administrator to set it up." };
  const ctx = await loadScopedContext(user);

  // Keep only the last ~8 turns of user/assistant text (bound tokens).
  const history = userMessages.filter((m) => m.role === "user" || m.role === "assistant").slice(-8).map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 2000) }));
  const messages: Msg[] = [{ role: "system", content: SYSTEM(ctx) }, ...history];
  const toolsUsed: string[] = [];

  const TOOL_NAMES = new Set<string>(TOOLS.map((t) => t.function.name));
  for (let step = 0; step < 6; step++) {
    const res = await callGroq(messages);
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

    // Recovery for a Llama-on-Groq quirk: it sometimes writes a tool call as TEXT in `content`
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

async function callGroq(messages: Msg[]): Promise<{ ok: true; message: Msg } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${config.groq.baseUrl}/chat/completions`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groq.apiKey}` },
      body: JSON.stringify({ model: config.groq.model, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 800 }),
    });
    const text = await res.text();
    if (!res.ok) { console.error("[assistant] groq error", res.status, text.slice(0, 300)); return { ok: false, error: res.status === 429 ? "The assistant is busy (rate limit) — try again in a moment." : "The assistant is temporarily unavailable." }; }
    const data = JSON.parse(text);
    const message = data?.choices?.[0]?.message;
    if (!message) return { ok: false, error: "The assistant returned an empty response." };
    return { ok: true, message };
  } catch (e: any) {
    console.error("[assistant] call failed:", e?.message || e);
    return { ok: false, error: e?.name === "AbortError" ? "The assistant timed out — please try again." : "The assistant is temporarily unavailable." };
  } finally { clearTimeout(timer); }
}
