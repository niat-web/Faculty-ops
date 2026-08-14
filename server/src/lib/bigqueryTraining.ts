import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Response } from "express";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "../config";

// CSV-escape one cell (quote if it contains a comma, quote, or newline).
function csvCell(v: any): string { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

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

// Per-column filter map: { columnName: [selectedValue, …] }. Rows must match ALL filtered columns
// (AND across columns), any of the values within a column (IN). Column names are validated against the
// real schema (injection-safe); values are always parameterized.
export type ColumnFilters = Record<string, string[]>;

function buildBqWhere(columns: string[], q?: string, filters?: ColumnFilters): { where: string; params: any } {
  const colset = new Set(columns);
  const clauses: string[] = [];
  const params: any = {};
  if (q) { clauses.push("LOWER(TO_JSON_STRING(t)) LIKE @q"); params.q = `%${q.toLowerCase()}%`; }
  let i = 0;
  for (const [col, vals] of Object.entries(filters || {})) {
    if (!colset.has(col) || !Array.isArray(vals) || !vals.length) continue; // ignore unknown columns / empty
    const p = `f${i++}`;
    clauses.push(`CAST(t.\`${col}\` AS STRING) IN UNNEST(@${p})`);
    params[p] = vals.map((v) => String(v));
  }
  return { where: clauses.length ? "WHERE " + clauses.join(" AND ") : "", params };
}

export async function fetchBigQueryRows(limit: number, offset: number, q?: string, filters?: ColumnFilters): Promise<RawTablePage> {
  const source = `${config.bigQuery.projectId}.${config.bigQuery.dataset}.${config.bigQuery.table}`;
  const fetchedAt = new Date().toISOString();
  if (!configured()) return { ok: false, columns: [], rows: [], total: 0, fetchedAt, source, error: "BigQuery is not configured." };
  try {
    const bq = client();
    const columns = await tableColumns(bq);
    const table = `\`${source}\``;
    const { where, params } = buildBqWhere(columns, q, filters);
    const [countRows] = await bq.query({ query: `SELECT COUNT(*) AS n FROM ${table} t ${where}`, params });
    const total = Number(cellValue((countRows[0] as any)?.n)) || 0;
    const [rows] = await bq.query({ query: `SELECT * FROM ${table} t ${where} LIMIT @limit OFFSET @offset`, params: { ...params, limit, offset } });
    const flat = (rows as any[]).map((r) => { const o: Record<string, any> = {}; for (const c of columns) o[c] = cellValue(r[c]); return o; });
    return { ok: true, columns, rows: flat, total, fetchedAt, source };
  } catch (e: any) {
    return { ok: false, columns: [], rows: [], total: 0, fetchedAt, source, error: e?.message || "BigQuery query failed." };
  }
}

// Distinct values PER COLUMN across the ENTIRE table (for the filter dropdowns). One table scan via
// ARRAY_AGG(DISTINCT … LIMIT N) per column, capped so a high-cardinality column can't blow up the payload.
// Cached (15 min) — facets change rarely and each call is a full scan.
const FACET_CAP = 1000;
const FACET_TTL = 15 * 60 * 1000;
let bqFacetCache: { at: number; facets: Record<string, string[]> } | null = null;
export async function bigQueryFacets(refresh?: boolean): Promise<{ ok: boolean; facets: Record<string, string[]>; capped: number; error?: string }> {
  if (!configured()) return { ok: false, facets: {}, capped: FACET_CAP, error: "BigQuery is not configured." };
  if (!refresh && bqFacetCache && Date.now() - bqFacetCache.at < FACET_TTL) return { ok: true, facets: bqFacetCache.facets, capped: FACET_CAP };
  try {
    const bq = client();
    const columns = await tableColumns(bq);
    const table = `\`${config.bigQuery.projectId}.${config.bigQuery.dataset}.${config.bigQuery.table}\``;
    // One row, one array per column (aliased a0,a1,… to avoid odd column names).
    const selects = columns.map((c, i) => `ARRAY_AGG(DISTINCT CAST(t.\`${c}\` AS STRING) IGNORE NULLS LIMIT ${FACET_CAP}) AS a${i}`);
    const [rows] = await bq.query({ query: `SELECT ${selects.join(", ")} FROM ${table} t` });
    const row: any = rows[0] || {};
    const facets: Record<string, string[]> = {};
    columns.forEach((c, i) => { const arr = row[`a${i}`]; facets[c] = Array.isArray(arr) ? arr.map((v: any) => String(v)).filter(Boolean).sort((x, y) => x.localeCompare(y)) : []; });
    bqFacetCache = { at: Date.now(), facets };
    return { ok: true, facets, capped: FACET_CAP };
  } catch (e: any) {
    return { ok: false, facets: {}, capped: FACET_CAP, error: e?.message || "BigQuery facets query failed." };
  }
}

// STREAM the ENTIRE BigQuery table (optionally filtered by `q`) as CSV directly to the HTTP response.
// The table can be millions of rows, so we STREAM row-by-row via createQueryStream (never load it all
// into memory). Backpressure is handled by pausing the query stream when the socket buffer is full.
export async function streamBigQueryCsv(res: Response, q?: string, filters?: ColumnFilters): Promise<void> {
  if (!configured()) { res.status(502).json({ error: "BigQuery is not configured." }); return; }
  let columns: string[];
  try {
    const bq = client();
    columns = await tableColumns(bq); // pre-flight: also validates the table is queryable before we send headers
    const table = `\`${config.bigQuery.projectId}.${config.bigQuery.dataset}.${config.bigQuery.table}\``;
    const { where, params } = buildBqWhere(columns, q, filters);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bigquery-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write("﻿" + columns.map(csvCell).join(",") + "\r\n"); // UTF-8 BOM (Excel) + header row

    const stream = bq.createQueryStream({ query: `SELECT * FROM ${table} t ${where}`, params });
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (row: any) => {
        const line = columns.map((c) => csvCell(cellValue(row[c]))).join(",") + "\r\n";
        if (!res.write(line)) { stream.pause(); res.once("drain", () => stream.resume()); } // backpressure
      });
      stream.on("end", () => resolve());
      stream.on("error", (e) => reject(e));
      res.on("close", () => { try { (stream as any).destroy?.(); } catch { /* client aborted */ } resolve(); });
    });
    res.end();
  } catch (e: any) {
    console.error("[data] bigquery export failed:", e?.message || e);
    if (!res.headersSent) res.status(502).json({ error: e?.message || "BigQuery export failed." });
    else res.end(); // headers already flushed → end the (partial) download
  }
}

// ---- Dataset / table browser (Data page → BigQuery) -------------------------------------------
// Lists every dataset + table the service account can see, and lets the UI open ANY table (not just
// the configured training table). Identifiers are validated against a strict regex before being
// interpolated into backtick-quoted SQL (injection-safe); values are always parameterized.
const BQ_IDENT = /^[A-Za-z0-9_]+$/;
function bqConnected() { return Boolean(config.bigQuery.projectId && config.bigQuery.credentials); }

export async function listBigQueryDatasets(): Promise<{ ok: boolean; project: string; datasets: { id: string; tables: string[] }[]; error?: string }> {
  const project = config.bigQuery.projectId;
  if (!bqConnected()) return { ok: false, project, datasets: [], error: "BigQuery is not configured." };
  try {
    const bq = client();
    const [datasets] = await bq.getDatasets();
    const out: { id: string; tables: string[] }[] = [];
    for (const ds of datasets) {
      let tables: string[] = [];
      try { const [ts] = await bq.dataset(ds.id!).getTables(); tables = ts.map((t: any) => String(t.id)).filter(Boolean).sort((a, b) => a.localeCompare(b)); }
      catch { /* no access to this dataset's tables — skip */ }
      out.push({ id: String(ds.id), tables });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, project, datasets: out };
  } catch (e: any) {
    return { ok: false, project, datasets: [], error: e?.message || "Failed to list BigQuery datasets." };
  }
}

function assertIdent(dataset: string, table: string) {
  if (!BQ_IDENT.test(dataset) || !BQ_IDENT.test(table)) throw new Error("Invalid dataset or table name.");
}

export async function fetchBigQueryTable(dataset: string, table: string, limit: number, offset: number, q?: string): Promise<RawTablePage> {
  const source = `${config.bigQuery.projectId}.${dataset}.${table}`;
  const fetchedAt = new Date().toISOString();
  if (!bqConnected()) return { ok: false, columns: [], rows: [], total: 0, fetchedAt, source, error: "BigQuery is not configured." };
  try {
    assertIdent(dataset, table);
    const bq = client();
    const tref = `\`${config.bigQuery.projectId}.${dataset}.${table}\``;
    const params: any = {};
    let where = "";
    if (q && q.trim()) { where = "WHERE LOWER(TO_JSON_STRING(t)) LIKE @q"; params.q = `%${q.trim().toLowerCase()}%`; }
    const [countRows] = await bq.query({ query: `SELECT COUNT(*) AS n FROM ${tref} t ${where}`, params });
    const total = Number(cellValue((countRows[0] as any)?.n)) || 0;
    const [rows] = await bq.query({ query: `SELECT * FROM ${tref} t ${where} LIMIT @limit OFFSET @offset`, params: { ...params, limit, offset } });
    const columns: string[] = [];
    const seen = new Set<string>();
    for (const r of rows as any[]) for (const k of Object.keys(r || {})) if (!seen.has(k)) { seen.add(k); columns.push(k); }
    const flat = (rows as any[]).map((r) => { const o: Record<string, any> = {}; for (const c of columns) o[c] = cellValue(r[c]); return o; });
    return { ok: true, columns, rows: flat, total, fetchedAt, source };
  } catch (e: any) {
    return { ok: false, columns: [], rows: [], total: 0, fetchedAt, source, error: e?.message || "BigQuery query failed." };
  }
}

export async function streamBigQueryTableCsv(res: Response, dataset: string, table: string, q?: string): Promise<void> {
  if (!bqConnected()) { res.status(502).json({ error: "BigQuery is not configured." }); return; }
  try {
    assertIdent(dataset, table);
    const bq = client();
    const tref = `\`${config.bigQuery.projectId}.${dataset}.${table}\``;
    const params: any = {};
    let where = "";
    if (q && q.trim()) { where = "WHERE LOWER(TO_JSON_STRING(t)) LIKE @q"; params.q = `%${q.trim().toLowerCase()}%`; }
    // Discover columns from a 1-row probe so the CSV header is stable before streaming.
    const [probe] = await bq.query({ query: `SELECT * FROM ${tref} t ${where} LIMIT 1`, params });
    const columns = probe.length ? Object.keys(probe[0] as any) : [];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${dataset}-${table}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write("﻿" + columns.map(csvCell).join(",") + "\r\n");
    const stream = bq.createQueryStream({ query: `SELECT * FROM ${tref} t ${where}`, params });
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (row: any) => {
        const line = columns.map((c) => csvCell(cellValue(row[c]))).join(",") + "\r\n";
        if (!res.write(line)) { stream.pause(); res.once("drain", () => stream.resume()); }
      });
      stream.on("end", () => resolve());
      stream.on("error", (e) => reject(e));
      res.on("close", () => { try { (stream as any).destroy?.(); } catch { /* aborted */ } resolve(); });
    });
    res.end();
  } catch (e: any) {
    if (!res.headersSent) res.status(502).json({ error: e?.message || "BigQuery export failed." });
    else res.end();
  }
}

// ---- Per-instructor TeachOS performance metrics (Instructor profile → TeachOS tab) ----------------
// Aggregates one instructor's performance/quality data from the BigQuery instructor tables, matched
// by uid (instructor_user_id / user_id), hyphen+case-insensitive. Every section is queried
// independently and fails soft (null) so a missing/renamed table never breaks the whole response.
const TEACHOS_DS_AUTOMATION = "niat_instructor_automation_data";
const TEACHOS_DS_REVERSE = "niat_reverse_etl_bases";

export type TeachosMetrics = {
  ok: boolean;
  configured: boolean;
  found: boolean;
  category: string | null;
  context: { role: string | null; category: string | null; manager: string | null; managerMail: string | null; institute: string | null } | null;
  scorecard: { overall: number | null; lecture: number | null; practice: number | null; max: number | null } | null;
  feedback: { studentScore: number | null; teachingQuality: number | null; guidanceClarity: number | null; understanding: number | null; lectureSessions: number | null; practiceSessions: number | null } | null;
  qa: { avgRating: number | null; sessions: number | null } | null;
  demos: { scheduled: number | null; taken: number | null; pending: number | null; avgRating: number | null } | null;
  assessments: { codingScore: number | null; mcqScore: number | null } | null;
  sessionsSummary: { grooming: number | null; performance: number | null } | null;
  sentiment: { positive: number; negative: number; neutral: number } | null;
  comments: { text: string; sentiment: string | null; category: string | null; session: string | null }[];
  recentSessions: { title: string; type: string | null; date: string | null; status: string | null; teachingQuality: number | null; qaRating: number | null }[];
  error?: string;
};

const bqNum = (v: any): number | null => { const n = Number(cellValue(v)); return Number.isFinite(n) ? n : null; };
const bqStr = (v: any): string | null => { const s = String(cellValue(v) ?? "").trim(); return s || null; };

// Per-instructor cache (10 min) — the TeachOS tab fans out ~11 BigQuery queries over large tables,
// so caching keeps repeated profile opens fast and cheap.
const TEACHOS_TTL = 10 * 60 * 1000;
const teachosCache = new Map<string, { at: number; data: TeachosMetrics }>();

export async function fetchInstructorTeachosMetrics(uid: string): Promise<TeachosMetrics> {
  const empty: TeachosMetrics = { ok: true, configured: bqConnected(), found: false, category: null, context: null, scorecard: null, feedback: null, qa: null, demos: null, assessments: null, sessionsSummary: null, sentiment: null, comments: [], recentSessions: [] };
  const key = normId(uid);
  if (!bqConnected()) return { ...empty, ok: false, configured: false, error: "BigQuery is not configured." };
  if (!key) return empty;
  const cached = teachosCache.get(key);
  if (cached && Date.now() - cached.at < TEACHOS_TTL) return cached.data;

  const bq = client();
  const P = config.bigQuery.projectId;
  const ref = (ds: string, t: string) => `\`${P}.${ds}.${t}\``;
  // Match either instructor_user_id or user_id (assessment tables), hyphen/case-insensitive.
  const whereU = (col: string) => `LOWER(REPLACE(CAST(${col} AS STRING), '-', '')) = @uid`;
  const one = async (sql: string): Promise<any | null> => {
    try { const [rows] = await bq.query({ query: sql, params: { uid: key } }); return (rows as any[])[0] || null; }
    catch { return null; } // table missing / column renamed → skip this section
  };
  const many = async (sql: string): Promise<any[]> => {
    try { const [rows] = await bq.query({ query: sql, params: { uid: key } }); return rows as any[]; }
    catch { return []; }
  };

  const [sc, fb, qa, demo, coding, mcq, ss, ctx, sent, comm, sess] = await Promise.all([
    one(`SELECT AVG(SAFE_CAST(overall_score AS FLOAT64)) o, AVG(SAFE_CAST(overall_lecture_session_score AS FLOAT64)) l, AVG(SAFE_CAST(overall_practice_session_score AS FLOAT64)) p, AVG(SAFE_CAST(max_score AS FLOAT64)) m FROM ${ref(TEACHOS_DS_REVERSE, "niat_reverse_etl_instructor_overall_score_card_details")} WHERE ${whereU("instructor_user_id")}`),
    one(`SELECT AVG(SAFE_CAST(overall_student_feedback_score AS FLOAT64)) s, AVG(SAFE_CAST(teaching_quality AS FLOAT64)) tq, AVG(SAFE_CAST(guidance_clarity_rating AS FLOAT64)) gc, AVG(SAFE_CAST(session_understanding_rating AS FLOAT64)) u, SUM(SAFE_CAST(total_lecture_sessions AS FLOAT64)) ls, SUM(SAFE_CAST(total_practice_sessions AS FLOAT64)) ps FROM ${ref(TEACHOS_DS_REVERSE, "niat_instructor_team_performance_students_feedback_summary")} WHERE ${whereU("instructor_user_id")}`),
    one(`SELECT AVG(SAFE_CAST(final_score AS FLOAT64)) avg, COUNT(*) n, ANY_VALUE(instructor_category) cat FROM ${ref(TEACHOS_DS_AUTOMATION, "niat_session_wise_qa_rating")} WHERE ${whereU("instructor_user_id")}`),
    one(`SELECT SUM(SAFE_CAST(no_of_scheduled_demo_sessions AS FLOAT64)) s, SUM(SAFE_CAST(no_of_demo_taken_session AS FLOAT64)) t, SUM(SAFE_CAST(no_of_pending_demo_sessions AS FLOAT64)) p, AVG(SAFE_CAST(avg_demo_qa_rating AS FLOAT64)) r, ANY_VALUE(instructor_category) cat FROM ${ref(TEACHOS_DS_AUTOMATION, "z_niat_training_instructors_online_demo_details")} WHERE ${whereU("instructor_user_id")}`),
    one(`SELECT AVG(SAFE_CAST(percentage_score AS FLOAT64)) v FROM ${ref(TEACHOS_DS_AUTOMATION, "z_niat_instructor_topin_assessment_coding_set_details")} WHERE ${whereU("user_id")}`),
    one(`SELECT AVG(SAFE_CAST(percentage_score AS FLOAT64)) v FROM ${ref(TEACHOS_DS_AUTOMATION, "z_niat_instructor_topin_assessment_mcq_set_details")} WHERE ${whereU("user_id")}`),
    one(`SELECT AVG(SAFE_CAST(overall_grooming_score AS FLOAT64)) g, AVG(SAFE_CAST(performance_rating AS FLOAT64)) p FROM ${ref(TEACHOS_DS_AUTOMATION, "niat_sessions_wise_summary_details")} WHERE ${whereU("instructor_user_id")}`),
    // Context — role / manager / institute (from the instructor↔manager mapping table).
    one(`SELECT ANY_VALUE(instructor_role) role, ANY_VALUE(instructor_manager_category) cat, ANY_VALUE(instructor_manager) mgr, ANY_VALUE(instructor_manager_mail) mail, ANY_VALUE(institute_name) inst FROM ${ref(TEACHOS_DS_AUTOMATION, "niat_instructor_managers_and_instructors_details")} WHERE ${whereU("instructor_user_id")}`),
    // Student-feedback sentiment breakdown.
    many(`SELECT LOWER(sentiment) s, COUNT(*) c FROM ${ref(TEACHOS_DS_AUTOMATION, "niat_session_wise_user_feedback_details_with_sentiment_type")} WHERE ${whereU("instructor_user_id")} AND sentiment IS NOT NULL GROUP BY LOWER(sentiment)`),
    // Recent student comments (actual text).
    many(`SELECT learning_session_additional_feedback t, sentiment se, feedback_category cat, session_title sess FROM ${ref(TEACHOS_DS_AUTOMATION, "niat_session_wise_user_feedback_details_with_sentiment_type")} WHERE ${whereU("instructor_user_id")} AND learning_session_additional_feedback IS NOT NULL AND LENGTH(TRIM(learning_session_additional_feedback)) > 3 ORDER BY feedback_submission_datetime DESC LIMIT 8`),
    // Recent sessions with their ratings.
    many(`SELECT session_title title, session_type type, session_start_datetime dt, session_status status, SAFE_CAST(average_session_teaching_quality_rating AS FLOAT64) tq, SAFE_CAST(qa_rating AS FLOAT64) qa FROM ${ref(TEACHOS_DS_AUTOMATION, "niat_sessions_wise_summary_details")} WHERE ${whereU("instructor_user_id")} AND session_title IS NOT NULL ORDER BY session_start_datetime DESC LIMIT 8`),
  ]);

  const scorecard = sc && (bqNum(sc.o) != null || bqNum(sc.l) != null) ? { overall: bqNum(sc.o), lecture: bqNum(sc.l), practice: bqNum(sc.p), max: bqNum(sc.m) } : null;
  const feedback = fb && (bqNum(fb.s) != null || bqNum(fb.tq) != null || bqNum(fb.ls) != null) ? { studentScore: bqNum(fb.s), teachingQuality: bqNum(fb.tq), guidanceClarity: bqNum(fb.gc), understanding: bqNum(fb.u), lectureSessions: bqNum(fb.ls), practiceSessions: bqNum(fb.ps) } : null;
  const qaOut = qa && bqNum(qa.n) ? { avgRating: bqNum(qa.avg), sessions: bqNum(qa.n) } : null;
  const demos = demo && (bqNum(demo.s) != null || bqNum(demo.t) != null) ? { scheduled: bqNum(demo.s), taken: bqNum(demo.t), pending: bqNum(demo.p), avgRating: bqNum(demo.r) } : null;
  const assessments = (coding && bqNum(coding.v) != null) || (mcq && bqNum(mcq.v) != null) ? { codingScore: coding ? bqNum(coding.v) : null, mcqScore: mcq ? bqNum(mcq.v) : null } : null;
  const sessionsSummary = ss && (bqNum(ss.g) != null || bqNum(ss.p) != null) ? { grooming: bqNum(ss.g), performance: bqNum(ss.p) } : null;
  const context = ctx && (bqStr(ctx.role) || bqStr(ctx.mgr) || bqStr(ctx.inst)) ? { role: bqStr(ctx.role), category: bqStr(ctx.cat), manager: bqStr(ctx.mgr), managerMail: bqStr(ctx.mail), institute: bqStr(ctx.inst) } : null;

  const sMap: Record<string, number> = {};
  for (const r of sent) sMap[String(cellValue(r.s) || "").toLowerCase()] = bqNum(r.c) || 0;
  const sentiment = (sMap.positive || sMap.negative || sMap.neutral) ? { positive: sMap.positive || 0, negative: sMap.negative || 0, neutral: sMap.neutral || 0 } : null;
  const comments = comm.map((r) => ({ text: bqStr(r.t) || "", sentiment: bqStr(r.se), category: bqStr(r.cat), session: bqStr(r.sess) })).filter((c) => c.text);
  const recentSessions = sess.map((r) => ({ title: bqStr(r.title) || "", type: bqStr(r.type), date: bqStr(r.dt), status: bqStr(r.status), teachingQuality: bqNum(r.tq), qaRating: bqNum(r.qa) })).filter((s) => s.title);

  const category = (context && context.category) || (qa && qa.cat ? bqStr(qa.cat) : null) || (demo && demo.cat ? bqStr(demo.cat) : null) || null;
  const found = Boolean(scorecard || feedback || qaOut || demos || assessments || sessionsSummary || context || sentiment || comments.length || recentSessions.length);

  const result: TeachosMetrics = { ok: true, configured: true, found, category, context, scorecard, feedback, qa: qaOut, demos, assessments, sessionsSummary, sentiment, comments, recentSessions };
  teachosCache.set(key, { at: Date.now(), data: result });
  return result;
}

// Short-lived cache so Dashboard + Training Stats (and repeated loads of either) reuse the SAME
// BigQuery result instead of re-querying every time. Keyed by the exact course + instructor identity
// set, so different pages/tracks cache independently but identical requests are instant.
const PROGRESS_TTL_MS = 3 * 60 * 1000;
const progressCache = new Map<string, { at: number; result: TrainingProgressSync }>();

export async function fetchTrainingProgress(courses: CourseColumn[], instructors: InstructorKey[], opts?: { fresh?: boolean }): Promise<TrainingProgressSync> {
  const courseIds = [...new Set(courses.map((c) => clean(c.courseId)).filter(Boolean))].sort();
  const idKeys = instructors.map((i) => `${clean(i.employeeId)}|${clean(i.email).toLowerCase()}|${normId(i.uid)}`).sort();
  const cacheKey = crypto.createHash("sha1").update(`${courseIds.join(",")}#${idKeys.join(",")}`).digest("hex");
  if (!opts?.fresh) { // fresh:true bypasses the cache (e.g. Training Stats always wants the latest)
    const hit = progressCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PROGRESS_TTL_MS) return hit.result;
  }
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
