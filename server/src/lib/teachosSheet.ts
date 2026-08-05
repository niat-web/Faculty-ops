import fs from "fs";
import path from "path";
import { GoogleAuth } from "google-auth-library";
import { config } from "../config";

// TeachOS instructor/manager data (niat_instructor_managers_and_instructors_details), exported
// from Hex into a Google Sheet as a stopgap ahead of a direct Hex/BigQuery connection. Read-only
// fetch via the Sheets API v4 REST endpoint, using a dedicated service account (config.teachosSheet
// .credentials) — the sheet must be shared (Viewer is enough) with that service account's client_email.

// The credentials env var may be a file PATH (local), inline JSON, or base64 JSON (cloud).
function credentialOpts(raw: string): { keyFile?: string; credentials?: any } {
  const cred = String(raw || "").trim();
  let jsonText = "";
  if (cred.startsWith("{")) jsonText = cred;
  else if (cred.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(cred)) {
    try { const decoded = Buffer.from(cred, "base64").toString("utf8"); if (decoded.trim().startsWith("{")) jsonText = decoded; } catch { /* not base64 */ }
  }
  if (jsonText) {
    try { return { credentials: JSON.parse(jsonText) }; }
    catch { throw new Error("TeachOS Google credentials JSON is invalid (base64 is recommended)."); }
  }
  const keyFile = path.resolve(process.cwd(), cred);
  if (!fs.existsSync(keyFile)) throw new Error(`TeachOS Google credentials file not found at ${keyFile}.`);
  return { keyFile };
}

let _auth: GoogleAuth | null = null;
function auth(): GoogleAuth {
  if (_auth) return _auth;
  const opts: any = { scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] };
  Object.assign(opts, credentialOpts(config.teachosSheet.credentials));
  _auth = new GoogleAuth(opts);
  return _auth;
}

async function accessToken(): Promise<string> {
  const client = await auth().getClient();
  const t = await client.getAccessToken();
  const token = typeof t === "string" ? t : t?.token;
  if (!token) throw new Error("Could not obtain a Google access token.");
  return token;
}

export function teachosSheetConfigured(): boolean {
  return Boolean(config.teachosSheet.credentials && config.teachosSheet.spreadsheetId);
}

const clean = (v: any) => String(v ?? "").trim();
const norm = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const pick = (cols: string[], candidates: string[]) => {
  const byNorm = new Map(cols.map((c, i) => [norm(c), i]));
  for (const c of candidates) {
    const hit = byNorm.get(norm(c));
    if (hit != null) return hit;
  }
  return -1;
};

export type TeachosRow = {
  instructorUid: string;
  managerUid: string;      // instructormanager_id — the manager's OWN uid (managers are instructors too)
  managerName: string;     // instructor_manager — raw name text, used only as a fallback if managerUid doesn't match anyone
  managerCategory: string;
  role: string;
  instituteName: string;
};

// Fetches and parses the sheet's first tab (row 1 = headers). Header matching is name-based
// (not position-based), so column order or the sheet's trailing blank columns don't break it.
export async function fetchTeachosRows(): Promise<TeachosRow[]> {
  if (!teachosSheetConfigured()) throw new Error("TeachOS sheet isn't configured (set TEACHOS_GOOGLE_CREDENTIALS + TEACHOS_SHEET_ID).");
  const token = await accessToken();
  const { spreadsheetId, range } = config.teachosSheet;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`TeachOS sheet fetch failed (HTTP ${res.status}): ${data?.error?.message || "unknown error"}`);

  const values: any[][] = data?.values || [];
  if (values.length < 2) return [];
  const header = values[0].map((h: any) => clean(h));
  const uidIdx = pick(header, ["instructor_user_id"]);
  const managerUidIdx = pick(header, ["instructormanager_id"]);
  const managerNameIdx = pick(header, ["instructor_manager"]);
  const categoryIdx = pick(header, ["instructor_manager_category"]);
  const roleIdx = pick(header, ["instructor_role"]);
  const instituteIdx = pick(header, ["institute_name"]);
  if (uidIdx < 0) throw new Error("TeachOS sheet is missing the instructor_user_id column.");

  const rows: TeachosRow[] = [];
  for (const row of values.slice(1)) {
    const instructorUid = clean(row[uidIdx]);
    if (!instructorUid) continue;
    rows.push({
      instructorUid,
      managerUid: managerUidIdx >= 0 ? clean(row[managerUidIdx]) : "",
      managerName: managerNameIdx >= 0 ? clean(row[managerNameIdx]) : "",
      managerCategory: categoryIdx >= 0 ? clean(row[categoryIdx]) : "",
      role: roleIdx >= 0 ? clean(row[roleIdx]) : "",
      instituteName: instituteIdx >= 0 ? clean(row[instituteIdx]) : "",
    });
  }
  return rows;
}
