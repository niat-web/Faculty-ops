import { Router } from "express";
import type { Response } from "express";
import { requireUser } from "../middleware";
import { canViewData } from "../lib/rbac";
import { config } from "../config";
import { getDarwinboxData } from "../lib/darwinbox";

// Set of currently-ACTIVE employee IDs (from the main masterapi/employee dataset, read-only + cached).
// Used only to LABEL each separation row as "Still Employed (notice)" vs "Exited" — we don't change
// the main integration. Returns an empty set if the active dataset isn't configured/available.
async function activeEmployeeIdSet(): Promise<Set<string>> {
  try {
    const data = await getDarwinboxData(false);
    if (!data.ok || !data.rows.length) return new Set();
    const idCol = data.columns.find((c) => /employee_?id/i.test(c)) || "employee_id";
    return new Set(data.rows.map((r) => String(r[idCol] ?? "").trim().toUpperCase()).filter(Boolean));
  } catch { return new Set(); }
}
const EMP_STATE_COL = "Employment State";

// Standalone Darwinbox data checker — a self-contained page to view a PRE-FILTERED Darwinbox
// report (e.g. "exited / left employees only"). It targets the Report Builder API
// (POST /reportsbuilderapi/reportdatav2) with a report_id you create in Darwinbox Report Builder.
//
// Fully independent from the main Darwinbox integration: its OWN env vars (DBX_CHECK_*), its OWN
// fetch + cache. Nothing here writes, syncs, or touches any collection. Ops / Super-Admin only.
const router = Router();
router.use(requireUser());
router.use((req, res, next) => (canViewData(req.user!) ? next() : res.status(403).json({ error: "Forbidden" })));

const REQUIRED = ["DBX_CHECK_ENDPOINT", "DBX_CHECK_USERNAME", "DBX_CHECK_PASSWORD", "DBX_CHECK_API_KEY", "DBX_CHECK_REPORT_ID"] as const;

function creds() { return config.darwinboxCheck; }
function configured() {
  const d = creds();
  return Boolean(d.endpoint && d.username && d.password && d.apiKey && d.reportId);
}

// ── Fetch + cache (independent from lib/darwinbox.ts) ──────────────────────────────────────────
const CACHE_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; columns: string[]; rows: Record<string, any>[] } | null = null;

function cellValue(v: any): any {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

// The Report Builder response wraps rows in { response: { data: [...] , ... } } — but the exact
// shape varies by tenant/version, so dig for the first array of objects defensively.
function extractRows(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const containers = [data, data.response, data.data, data.result, data.report, data.response?.data];
  for (const c of containers) {
    if (Array.isArray(c) && c.length && typeof c[0] === "object") return c;
    if (c && typeof c === "object") {
      for (const key of ["data", "rows", "report_data", "records", "employee_data"]) {
        if (Array.isArray(c[key]) && c[key].length && typeof c[key][0] === "object") return c[key];
      }
    }
  }
  for (const v of Object.values(data)) if (Array.isArray(v) && v.length && typeof v[0] === "object") return v as any[];
  return [];
}

// A large report may hand back a tokenized download link instead of inline rows.
function extractDownloadLink(data: any): string | null {
  const r = data?.response ?? data;
  const link = r?.data_download_link || r?.download_link || r?.data_download_url;
  return typeof link === "string" && link ? link : null;
}

async function post(url: string, body: any): Promise<{ status: number; data: any; text: string }> {
  const d = creds();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const auth = "Basic " + Buffer.from(`${d.username}:${d.password}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, data: json, text };
  } finally {
    clearTimeout(timer);
  }
}

// Fetch ALL rows of one report — reportdatav2 wraps them in { response: { summary, data[], next } };
// `next` is "false" when done, otherwise a continuation token we pass back. Hard-capped page loop.
async function fetchReport(reportId: string): Promise<{ rows: any[]; downloadLink: string | null }> {
  const d = creds();
  const all: any[] = [];
  let next: any = undefined;
  const MAX_PAGES = 200;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body: any = { api_key: d.apiKey, report_id: reportId };
    if (next && next !== "false" && next !== false) body.next = next;
    const { status, data, text } = await post(d.endpoint, body);
    if (data == null) throw new Error(`Darwinbox returned a non-JSON response (HTTP ${status}).`);
    if (status < 200 || status >= 300) throw new Error(`Darwinbox request failed (HTTP ${status}): ${data?.message || data?.error || text.slice(0, 200)}`);
    const link = extractDownloadLink(data);
    if (link && !all.length) return { rows: [], downloadLink: link };
    const rows = extractRows(data);
    if (!rows.length) {
      if (page === 1 && data?.status != null && Number(data.status) !== 1) {
        throw new Error(`Darwinbox error: ${data?.message || "request rejected (check credentials / report_id)."}`);
      }
      break;
    }
    all.push(...rows);
    const resp = data?.response ?? data;
    next = resp?.next;
    if (!next || next === "false" || next === false) break;
  }
  return { rows: all, downloadLink: null };
}

const normId = (v: any) => String(v ?? "").trim().toUpperCase();
const idColOf = (row: any) => (row && Object.keys(row).find((k) => /employee\s*_?\s*id/i.test(k))) || "Employee Id";

// Load the base exited list, filter to real leavers, label Employment State, then JOIN detail
// columns (department, designation, email, mobile, manager, exit category…) from the configured
// enrichment reports by Employee Id.
async function loadAll(): Promise<{ columns: string[]; rows: Record<string, any>[]; note?: string }> {
  const d = creds();
  let note: string | undefined;

  const base = await fetchReport(d.reportId);
  if (base.downloadLink) {
    return { columns: [], rows: [], note: "This report is large — Darwinbox returned a download link instead of inline rows. Narrow the report or use CSV export." };
  }
  const all = base.rows;

  // Keep only real leavers (status filter) — excludes Revoked/Rejected/Pending.
  const includeRaw = String(d.statusInclude || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const statusCol = d.statusColumn;
  let filtered = all;
  let statusNote = "";
  if (includeRaw.length && all.length && statusCol && statusCol in (all[0] || {})) {
    const before = all.length;
    filtered = all.filter((r) => includeRaw.includes(String(r[statusCol] ?? "").trim().toLowerCase()));
    statusNote = `Showing ${filtered.length} of ${before} records where ${statusCol} is ${d.statusInclude}. `;
  }

  // Employment State: approved resignation but still in the active list = on notice; else exited.
  const activeIds = await activeEmployeeIdSet();
  const baseIdCol = idColOf(filtered[0]);
  let stillEmployed = 0, exited = 0;
  if (activeIds.size) {
    for (const r of filtered) {
      const isActive = activeIds.has(normId(r[baseIdCol]));
      r[EMP_STATE_COL] = isActive ? "Still Employed (notice period)" : "Exited";
      isActive ? stillEmployed++ : exited++;
    }
  }

  // ── Enrichment: merge detail columns from the configured reports, joined by Employee Id ──────────
  const enrichIds = String(d.enrichReportIds || "").split(",").map((s) => s.trim()).filter(Boolean);
  const baseKeys = new Set<string>([EMP_STATE_COL, ...(filtered[0] ? Object.keys(filtered[0]) : [])]);
  const detailById = new Map<string, Record<string, any>>();   // empId → merged detail (priority order)
  const enrichCols: string[] = [];                             // enrichment column order (deduped)
  const enrichColSeen = new Set<string>();
  for (const rid of enrichIds) {
    let rep: { rows: any[]; downloadLink: string | null };
    try { rep = await fetchReport(rid); } catch { continue; } // a bad enrichment id must not break the page
    if (!rep.rows.length) continue;
    const ic = idColOf(rep.rows[0]);
    // Which columns to pull from this report: everything except the join key / columns already in base.
    const cols = Object.keys(rep.rows[0]).filter((c) => c !== ic && !baseKeys.has(c));
    for (const c of cols) if (!enrichColSeen.has(c)) { enrichColSeen.add(c); enrichCols.push(c); }
    for (const row of rep.rows) {
      const id = normId(row[ic]);
      if (!id) continue;
      const cur = detailById.get(id) || {};
      for (const c of cols) {
        const v = row[c];
        if ((cur[c] == null || cur[c] === "") && v != null && String(v).trim() !== "") cur[c] = v; // first non-empty wins
      }
      detailById.set(id, cur);
    }
  }
  let enrichedCount = 0;
  if (enrichCols.length) {
    for (const r of filtered) {
      const det = detailById.get(normId(r[baseIdCol]));
      if (det) { enrichedCount++; for (const c of enrichCols) if (det[c] != null) r[c] = det[c]; }
    }
  }

  // Notes
  const parts: string[] = [];
  if (statusNote) parts.push(statusNote.trim());
  if (activeIds.size) parts.push(`${exited} already exited · ${stillEmployed} still employed (on notice).`);
  if (enrichCols.length) parts.push(`Enriched ${enrichedCount} of ${filtered.length} with full details (department, designation, email…) from ${enrichIds.length} report(s).`);
  note = parts.join(" ") || undefined;

  // Column order: Employment State → base report columns → enrichment columns.
  const baseCols: string[] = [];
  const seen = new Set<string>([EMP_STATE_COL]);
  for (const r of filtered) for (const k of Object.keys(r || {})) if (!seen.has(k) && !enrichColSeen.has(k)) { seen.add(k); baseCols.push(k); }
  const columns = [...(activeIds.size ? [EMP_STATE_COL] : []), ...baseCols, ...enrichCols];
  const rows = filtered.map((r) => { const o: Record<string, any> = {}; for (const c of columns) o[c] = cellValue((r || {})[c]); return o; });
  return { columns, rows, note };
}

async function getData(refresh?: boolean): Promise<{ ok: boolean; columns: string[]; rows: Record<string, any>[]; fetchedAt: string; note?: string; error?: string }> {
  if (!configured()) return { ok: false, columns: [], rows: [], fetchedAt: new Date().toISOString(), error: "Darwinbox Check is not configured (set the DBX_CHECK_* env vars, including DBX_CHECK_REPORT_ID)." };
  try {
    if (refresh || !cache || Date.now() - cache.fetchedAt > CACHE_MS) {
      const { columns, rows, note } = await loadAll();
      cache = { fetchedAt: Date.now(), columns, rows };
      return { ok: true, columns, rows, fetchedAt: new Date(cache.fetchedAt).toISOString(), note };
    }
    return { ok: true, columns: cache.columns, rows: cache.rows, fetchedAt: new Date(cache.fetchedAt).toISOString() };
  } catch (e: any) {
    return { ok: false, columns: [], rows: [], fetchedAt: new Date().toISOString(), error: e?.name === "AbortError" ? "Darwinbox request timed out." : e?.message || "Darwinbox fetch failed." };
  }
}

function applySearch(rows: Record<string, any>[], q?: string): Record<string, any>[] {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle)));
}
function csvCell(v: any): string { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

// ── Endpoints ──────────────────────────────────────────────────────────────────────────────────

// Which of the required env vars are present (values are NEVER returned — only booleans).
router.get("/status", (_req, res) => {
  const d = creds();
  const present: Record<string, boolean> = {
    DBX_CHECK_ENDPOINT: Boolean(d.endpoint),
    DBX_CHECK_USERNAME: Boolean(d.username),
    DBX_CHECK_PASSWORD: Boolean(d.password),
    DBX_CHECK_API_KEY: Boolean(d.apiKey),
    DBX_CHECK_REPORT_ID: Boolean(d.reportId),
  };
  const missing = REQUIRED.filter((k) => !present[k]);
  res.json({ configured: missing.length === 0, missing, endpoint: d.endpoint || null });
});

// Paginated rows for the on-screen table. ?refresh=1 bypasses the 5-min cache and pulls live.
router.get("/rows", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const q = String(req.query.q || "").trim();
  const refresh = String(req.query.refresh || "") === "1";
  const data = await getData(refresh);
  if (!data.ok) { res.status(502).json({ ok: false, columns: [], rows: [], total: 0, fetchedAt: data.fetchedAt, error: data.error }); return; }
  const filtered = applySearch(data.rows, q || undefined);
  res.json({ ok: true, columns: data.columns, rows: filtered.slice(offset, offset + limit), total: filtered.length, fetchedAt: data.fetchedAt, note: data.note, source: creds().endpoint });
});

// Lightweight connection test.
router.get("/test", async (req, res) => {
  const data = await getData(String(req.query.refresh || "") === "1");
  res.status(data.ok ? 200 : 502).json({ ok: data.ok, total: data.rows.length, columns: data.columns.length, fetchedAt: data.fetchedAt, note: data.note, error: data.error });
});

// Export the whole (optionally searched) report as CSV.
router.get("/export.csv", async (req: any, res: Response) => {
  const data = await getData(String(req.query.refresh || "") === "1");
  if (!data.ok) { res.status(502).json({ error: data.error || "Darwinbox fetch failed." }); return; }
  const rows = applySearch(data.rows, String(req.query.q || "").trim() || undefined);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="darwinbox-exited-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write("﻿" + data.columns.map(csvCell).join(",") + "\r\n"); // UTF-8 BOM + header
  let i = 0;
  const writeChunk = () => {
    while (i < rows.length) {
      const line = data.columns.map((c) => csvCell(rows[i][c])).join(",") + "\r\n";
      i++;
      if (!res.write(line)) { res.once("drain", writeChunk); return; }
    }
    res.end();
  };
  writeChunk();
});

export default router;
