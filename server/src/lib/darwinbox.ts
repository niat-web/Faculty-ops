import { config } from "../config";
import type { RawTablePage } from "./bigqueryTraining";

// Darwinbox master employee API — TWO-STEP flow (per Darwinbox docs):
//  1) POST the AUTHENTICATE endpoint with { username, password, api_key } → returns a { token }.
//  2) POST the EMPLOYEE endpoint with header TOKEN: <token> and body { datasetKey } → employee_data[].
// The full employee list comes back in one response, so we cache it briefly and page/filter in memory.

const CACHE_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; columns: string[]; rows: Record<string, any>[] } | null = null;

function configured() {
  const d = config.darwinbox;
  return Boolean(d.endpoint && d.username && d.password && d.apiKey && d.datasetKey);
}

async function postJson(url: string, body: any, headers: Record<string, string> = {}): Promise<{ status: number; data: any; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* non-JSON — caller decides */ }
    return { status: res.status, data, text };
  } finally {
    clearTimeout(timer);
  }
}

// The response wraps the employee list under a key that varies by API version — find the row array defensively.
function extractRows(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["employee_data", "employees", "data", "message"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const v of Object.values(data)) if (Array.isArray(v) && v.length && typeof v[0] === "object") return v as any[];
  return [];
}

// Flatten nested objects/arrays to display strings so every cell renders in the grid.
function cellValue(v: any): any {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function loadAll(): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
  const d = config.darwinbox;
  {
    // Single call — HTTP Basic auth (username:password) + { api_key, datasetKey } in the JSON body.
    // This matches the working NxtWave Darwinbox integration (Basic auth + api_key in body).
    const auth = "Basic " + Buffer.from(`${d.username}:${d.password}`).toString("base64");
    const { status, data, text } = await postJson(d.endpoint, { api_key: d.apiKey, datasetKey: d.datasetKey }, { Authorization: auth });
    if (data == null) throw new Error(`Darwinbox returned a non-JSON response (HTTP ${status}).`);
    if (status < 200 || status >= 300) throw new Error(`Darwinbox request failed (HTTP ${status}): ${data?.message || data?.error || text.slice(0, 200)}`);
    const raw = extractRows(data);
    if (!raw.length && data?.status != null && Number(data.status) !== 1) {
      throw new Error(`Darwinbox error: ${data?.message || "request rejected (check credentials/keys)."}`);
    }
    // Column order = first-seen key order across all rows.
    const columns: string[] = [];
    const seen = new Set<string>();
    for (const r of raw) for (const k of Object.keys(r || {})) if (!seen.has(k)) { seen.add(k); columns.push(k); }
    const rows = raw.map((r) => { const o: Record<string, any> = {}; for (const c of columns) o[c] = cellValue((r || {})[c]); return o; });
    return { columns, rows };
  }
}

// Full (cached) dataset — used by both the raw browser below and the Instructor Master sync.
export async function getDarwinboxData(refresh?: boolean): Promise<{ ok: boolean; columns: string[]; rows: Record<string, any>[]; fetchedAt: string; error?: string }> {
  if (!configured()) return { ok: false, columns: [], rows: [], fetchedAt: new Date().toISOString(), error: "Darwinbox is not configured (set the DARWINBOX_* env vars)." };
  try {
    if (refresh || !cache || Date.now() - cache.fetchedAt > CACHE_MS) {
      const { columns, rows } = await loadAll();
      cache = { fetchedAt: Date.now(), columns, rows };
    }
    return { ok: true, columns: cache.columns, rows: cache.rows, fetchedAt: new Date(cache.fetchedAt).toISOString() };
  } catch (e: any) {
    return { ok: false, columns: [], rows: [], fetchedAt: new Date().toISOString(), error: e?.name === "AbortError" ? "Darwinbox request timed out." : e?.message || "Darwinbox fetch failed." };
  }
}

export async function fetchDarwinboxRows(limit: number, offset: number, q?: string, refresh?: boolean): Promise<RawTablePage> {
  const source = config.darwinbox.endpoint;
  const data = await getDarwinboxData(refresh);
  if (!data.ok || !cache) return { ok: false, columns: [], rows: [], total: 0, fetchedAt: data.fetchedAt, source, error: data.error };
  {
    const needle = String(q || "").trim().toLowerCase();
    const filtered = needle
      ? cache.rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle)))
      : cache.rows;
    return {
      ok: true,
      columns: cache.columns,
      rows: filtered.slice(offset, offset + limit),
      total: filtered.length,
      fetchedAt: data.fetchedAt,
      source,
    };
  }
}
