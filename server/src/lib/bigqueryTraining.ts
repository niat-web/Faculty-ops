import fs from "fs";
import path from "path";
import crypto from "crypto";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "../config";

type InstructorKey = { id: string; employeeId?: string; email?: string; uid?: string };
type CourseColumn = { key: string; courseId?: string };
type ProgressCell = { status: string; percentage: number };

export type TrainingProgressSync = {
  ok: boolean;
  lastSyncedAt: string | null;
  cells: Record<string, Record<string, string>>;
  matched: number;
  instructorsMatched: number;
  totalInstructors: number;
  mappedCourses: number;
  error?: string;
};

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (v: any) => String(v ?? "").trim();
// UUIDs differ by format across systems (BigQuery keeps hyphens, our DB may not),
// so compare them hyphen-stripped + lowercased on both sides.
const normId = (v: any) => String(v ?? "").replace(/-/g, "").toLowerCase().trim();
const pick = (cols: string[], candidates: string[]) => {
  const byNorm = new Map(cols.map((c) => [norm(c), c]));
  for (const c of candidates) {
    const hit = byNorm.get(norm(c));
    if (hit) return hit;
  }
  return "";
};

// GOOGLE_APPLICATION_CREDENTIALS may be a file PATH (local dev) OR the service-account JSON itself
// (or base64 of it) — the latter is what cloud hosts like Northflank need, since env vars can't be files.
function credentialOpts(raw: string): { keyFilename?: string; credentials?: any } {
  const cred = String(raw || "").trim();
  let jsonText = "";
  if (cred.startsWith("{")) jsonText = cred; // inline JSON
  else if (cred.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(cred)) {
    // base64-encoded JSON (safest for env vars — avoids newline/escaping issues)
    try { const decoded = Buffer.from(cred, "base64").toString("utf8"); if (decoded.trim().startsWith("{")) jsonText = decoded; } catch { /* not base64 */ }
  }
  if (jsonText) {
    try { return { credentials: JSON.parse(jsonText) }; }
    catch { throw new Error("BigQuery credentials JSON is invalid (check escaping — base64 is recommended)."); }
  }
  // Otherwise treat it as a path to a key file (local dev).
  const keyFilename = path.resolve(process.cwd(), cred);
  if (!fs.existsSync(keyFilename)) throw new Error(`BigQuery credentials file not found at ${keyFilename} (set GOOGLE_APPLICATION_CREDENTIALS to the JSON/base64 for cloud hosts).`);
  return { keyFilename };
}

function client() {
  const opts: any = {};
  if (config.bigQuery.projectId) opts.projectId = config.bigQuery.projectId;
  if (config.bigQuery.credentials) Object.assign(opts, credentialOpts(config.bigQuery.credentials));
  return new BigQuery(opts);
}

function configured() {
  return Boolean(config.bigQuery.projectId && config.bigQuery.dataset && config.bigQuery.table && config.bigQuery.credentials);
}

function pctNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace("%", ""));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n > 0 && n <= 1 ? n * 100 : n));
}

function formatStatus(statusRaw: any, pctRaw: any): string | null {
  const pct = pctNum(pctRaw);
  const raw = clean(statusRaw);
  const lower = raw.toLowerCase();
  const status =
    pct === 100 ? "Completed" :
    pct === 0 ? "Not Started" :
    lower.includes("hold") ? "On Hold" :
    "In Progress";
  if (!status || pct == null) return null;
  return `${status} (${Math.round(pct)}%)`;
}

async function tableColumns(bq: BigQuery) {
  const sql = `
    SELECT column_name
    FROM \`${config.bigQuery.projectId}.${config.bigQuery.dataset}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = @table
  `;
  const [rows] = await bq.query({ query: sql, params: { table: config.bigQuery.table } });
  return rows.map((r: any) => String(r.column_name));
}

// ---- Raw table browse (Data page) -------------------------------------------------------------
// BigQuery cell values can be wrapper objects (BigQueryTimestamp/Date/Big) — flatten to plain strings.
function cellValue(v: any): any {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("value" in v) return cellValue((v as any).value);
    return JSON.stringify(v);
  }
  return v;
}

export type RawTablePage = {
  ok: boolean;
  columns: string[];
  rows: Record<string, any>[];
  total: number;
  fetchedAt: string;
  source: string;
  error?: string;
};

export async function fetchBigQueryRows(limit: number, offset: number, q?: string): Promise<RawTablePage> {
  const source = `${config.bigQuery.projectId}.${config.bigQuery.dataset}.${config.bigQuery.table}`;
  const fetchedAt = new Date().toISOString();
  if (!configured()) return { ok: false, columns: [], rows: [], total: 0, fetchedAt, source, error: "BigQuery is not configured." };
  try {
    const bq = client();
    const columns = await tableColumns(bq);
    const table = `\`${source}\``;
    // Generic search: match the query anywhere in the row (serialized) — fine for a data-preview tool.
    const where = q ? `WHERE LOWER(TO_JSON_STRING(t)) LIKE @q` : "";
    const params: any = q ? { q: `%${q.toLowerCase()}%` } : {};
    const [countRows] = await bq.query({ query: `SELECT COUNT(*) AS n FROM ${table} t ${where}`, params });
    const total = Number(cellValue((countRows[0] as any)?.n)) || 0;
    const [rows] = await bq.query({ query: `SELECT * FROM ${table} t ${where} LIMIT @limit OFFSET @offset`, params: { ...params, limit, offset } });
    const flat = (rows as any[]).map((r) => { const o: Record<string, any> = {}; for (const c of columns) o[c] = cellValue(r[c]); return o; });
    return { ok: true, columns, rows: flat, total, fetchedAt, source };
  } catch (e: any) {
    return { ok: false, columns: [], rows: [], total: 0, fetchedAt, source, error: e?.message || "BigQuery query failed." };
  }
}

// Short-lived cache so Dashboard + Training Stats (and repeated loads of either) reuse the SAME
// BigQuery result instead of re-querying every time. Keyed by the exact course + instructor identity
// set, so different pages/tracks cache independently but identical requests are instant.
const PROGRESS_TTL_MS = 3 * 60 * 1000;
const progressCache = new Map<string, { at: number; result: TrainingProgressSync }>();

export async function fetchTrainingProgress(courses: CourseColumn[], instructors: InstructorKey[]): Promise<TrainingProgressSync> {
  const courseIds = [...new Set(courses.map((c) => clean(c.courseId)).filter(Boolean))].sort();
  const idKeys = instructors.map((i) => `${clean(i.employeeId)}|${clean(i.email).toLowerCase()}|${normId(i.uid)}`).sort();
  const cacheKey = crypto.createHash("sha1").update(`${courseIds.join(",")}#${idKeys.join(",")}`).digest("hex");
  const hit = progressCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PROGRESS_TTL_MS) return hit.result;
  const result = await fetchTrainingProgressUncached(courses, instructors);
  if (result.ok) progressCache.set(cacheKey, { at: Date.now(), result }); // only cache successful pulls
  return result;
}

async function fetchTrainingProgressUncached(courses: CourseColumn[], instructors: InstructorKey[]): Promise<TrainingProgressSync> {
  if (!configured()) return { ok: false, lastSyncedAt: null, cells: {}, matched: 0, instructorsMatched: 0, totalInstructors: instructors.length, mappedCourses: 0, error: "BigQuery is not configured." };
  const courseIds = [...new Set(courses.map((c) => clean(c.courseId)).filter(Boolean))];
  const employeeIds = [...new Set(instructors.map((i) => clean(i.employeeId)).filter(Boolean))];
  const emails = [...new Set(instructors.map((i) => clean(i.email).toLowerCase()).filter(Boolean))];
  const uids = [...new Set(instructors.map((i) => normId(i.uid)).filter(Boolean))];
  if (!courseIds.length || (!employeeIds.length && !emails.length && !uids.length)) return { ok: true, lastSyncedAt: new Date().toISOString(), cells: {}, matched: 0, instructorsMatched: 0, totalInstructors: instructors.length, mappedCourses: courseIds.length };

  try {
    const bq = client();
    const cols = await tableColumns(bq);
    const courseCol = pick(cols, ["course_id", "courseId", "primary_course_id"]);
    // employee_id = the HR code (NW…); user id = the platform UUID (matched against our `uid`). Keep them separate.
    const employeeCol = pick(cols, ["employee_id", "employeeId", "instructor_employee_id", "emp_id", "employee_code"]);
    const userCol = pick(cols, ["user_id", "instructor_user_id", "user_uid", "instructor_uid", "uid", "userid", "learner_user_id"]);
    const emailCol = pick(cols, ["instructor_mail", "email", "instructor_email", "user_email"]);
    const statusCol = pick(cols, ["status", "completion_status", "course_status", "progress_status"]);
    const pctCol = pick(cols, ["completion_percentage", "completion_percent", "completion_pct", "percentage", "progress_percentage", "progress"]);
    if (!courseCol || (!employeeCol && !emailCol && !userCol) || !pctCol) throw new Error("BigQuery table is missing required course, instructor, or percentage columns.");

    const select = [
      `CAST(\`${courseCol}\` AS STRING) AS course_id`,
      employeeCol ? `CAST(\`${employeeCol}\` AS STRING) AS employee_id` : `CAST(NULL AS STRING) AS employee_id`,
      emailCol ? `LOWER(CAST(\`${emailCol}\` AS STRING)) AS email` : `CAST(NULL AS STRING) AS email`,
      userCol ? `CAST(\`${userCol}\` AS STRING) AS user_id` : `CAST(NULL AS STRING) AS user_id`,
      statusCol ? `ANY_VALUE(CAST(\`${statusCol}\` AS STRING)) AS status` : `CAST(NULL AS STRING) AS status`,
      `AVG(SAFE_CAST(\`${pctCol}\` AS FLOAT64)) AS percentage`,
    ].join(", ");
    const filters = [`CAST(\`${courseCol}\` AS STRING) IN UNNEST(@courseIds)`];
    if (employeeCol && employeeIds.length) filters.push(`CAST(\`${employeeCol}\` AS STRING) IN UNNEST(@employeeIds)`);
    if (emailCol && emails.length) filters.push(`LOWER(CAST(\`${emailCol}\` AS STRING)) IN UNNEST(@emails)`);
    // UID join: strip hyphens + lowercase on the BigQuery side too, so "94ad-cfe4-…" matches our "94adcfe4…".
    if (userCol && uids.length) filters.push(`REPLACE(LOWER(CAST(\`${userCol}\` AS STRING)), '-', '') IN UNNEST(@uids)`);
    const sql = `
      SELECT ${select}
      FROM \`${config.bigQuery.projectId}.${config.bigQuery.dataset}.${config.bigQuery.table}\`
      WHERE ${filters.length > 1 ? `${filters[0]} AND (${filters.slice(1).join(" OR ")})` : filters[0]}
      GROUP BY course_id, employee_id, email, user_id
    `;
    const [rows] = await bq.query({ query: sql, params: { courseIds, employeeIds, emails, uids } });
    const byCourse = new Map(courses.map((c) => [clean(c.courseId), c.key]));
    const byEmployee = new Map<string, string>();
    const byEmail = new Map<string, string>();
    const byUid = new Map<string, string>();
    for (const i of instructors) {
      const employeeId = clean(i.employeeId);
      const email = clean(i.email).toLowerCase();
      const uid = normId(i.uid);
      if (employeeId) byEmployee.set(employeeId, i.id);
      if (email) byEmail.set(email, i.id);
      if (uid) byUid.set(uid, i.id);
    }
    const best = new Map<string, ProgressCell>();

    for (const row of rows as any[]) {
      const instructorId = byUid.get(normId(row.user_id)) || byEmployee.get(clean(row.employee_id)) || byEmail.get(clean(row.email).toLowerCase());
      const colKey = byCourse.get(clean(row.course_id));
      const pct = pctNum(row.percentage);
      if (!instructorId || !colKey || pct == null) continue;
      const key = `${instructorId}::${colKey}`;
      const current = best.get(key);
      if (!current || pct >= current.percentage) best.set(key, { status: clean(row.status), percentage: pct });
    }

    const cells: Record<string, Record<string, string>> = {};
    for (const [key, cell] of best) {
      const [instructorId, colKey] = key.split("::");
      const formatted = formatStatus(cell.status, cell.percentage);
      if (!formatted) continue;
      (cells[instructorId] ||= {})[colKey] = formatted;
    }
    return { ok: true, lastSyncedAt: new Date().toISOString(), cells, matched: best.size, instructorsMatched: Object.keys(cells).length, totalInstructors: instructors.length, mappedCourses: courseIds.length };
  } catch (e: any) {
    return { ok: false, lastSyncedAt: null, cells: {}, matched: 0, instructorsMatched: 0, totalInstructors: instructors.length, mappedCourses: courseIds.length, error: e?.message || "BigQuery sync failed." };
  }
}
