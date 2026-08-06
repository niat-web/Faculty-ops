import fs from "fs";
import path from "path";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "../config";

// TeachOS instructor/manager data (niat_instructor_managers_and_instructors_details), now read
// directly from BigQuery — the data team added this table into the same dataset the app already
// queries for training completion (bigqueryTraining.ts), using the same project/credentials. This
// replaced the earlier Google Sheet stopgap (a manual Hex export of this same table).

const clean = (v: any) => String(v ?? "").trim();
const norm = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const pick = (columns: string[], candidates: string[]) => {
  const byNorm = new Map(columns.map((c) => [norm(c), c]));
  for (const c of candidates) {
    const hit = byNorm.get(norm(c));
    if (hit) return hit;
  }
  return "";
};

// GOOGLE_APPLICATION_CREDENTIALS may be a file PATH (local dev) OR the service-account JSON itself
// (or base64 of it) — mirrors bigqueryTraining.ts's credentialOpts().
function credentialOpts(raw: string): { keyFilename?: string; credentials?: any } {
  const cred = String(raw || "").trim();
  let jsonText = "";
  if (cred.startsWith("{")) jsonText = cred;
  else if (cred.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(cred)) {
    try { const decoded = Buffer.from(cred, "base64").toString("utf8"); if (decoded.trim().startsWith("{")) jsonText = decoded; } catch { /* not base64 */ }
  }
  if (jsonText) {
    try { return { credentials: JSON.parse(jsonText) }; }
    catch { throw new Error("BigQuery credentials JSON is invalid (check escaping — base64 is recommended)."); }
  }
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

export function teachosBigQueryConfigured(): boolean {
  return Boolean(config.bigQuery.credentials && config.bigQuery.projectId && config.bigQuery.dataset && config.bigQuery.teachosTable);
}

async function tableColumns(bq: BigQuery): Promise<string[]> {
  const sql = `
    SELECT column_name
    FROM \`${config.bigQuery.projectId}.${config.bigQuery.dataset}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = @table
  `;
  const [rows] = await bq.query({ query: sql, params: { table: config.bigQuery.teachosTable } });
  return rows.map((r: any) => String(r.column_name));
}

export type TeachosRow = {
  instructorUid: string;
  managerUid: string;      // instructormanager_id — the manager's OWN uid (managers are instructors too)
  managerName: string;     // instructor_manager — raw name text, used only as a fallback if managerUid doesn't match anyone
  managerCategory: string;
  role: string;
  instituteName: string;
};

export async function fetchTeachosRowsFromBigQuery(): Promise<TeachosRow[]> {
  if (!teachosBigQueryConfigured()) throw new Error("TeachOS BigQuery table isn't configured (set BIGQUERY_TEACHOS_TABLE, alongside the existing BigQuery credentials/project/dataset).");

  const bq = client();
  const columns = await tableColumns(bq);
  const uidCol = pick(columns, ["instructor_user_id"]);
  const managerUidCol = pick(columns, ["instructormanager_id"]);
  const managerNameCol = pick(columns, ["instructor_manager"]);
  const categoryCol = pick(columns, ["instructor_manager_category"]);
  const roleCol = pick(columns, ["instructor_role"]);
  const instituteCol = pick(columns, ["institute_name"]);
  if (!uidCol) throw new Error("TeachOS BigQuery table is missing the instructor_user_id column.");

  const select = [
    `CAST(\`${uidCol}\` AS STRING) AS instructor_uid`,
    managerUidCol ? `CAST(\`${managerUidCol}\` AS STRING) AS manager_uid` : `CAST(NULL AS STRING) AS manager_uid`,
    managerNameCol ? `CAST(\`${managerNameCol}\` AS STRING) AS manager_name` : `CAST(NULL AS STRING) AS manager_name`,
    categoryCol ? `CAST(\`${categoryCol}\` AS STRING) AS manager_category` : `CAST(NULL AS STRING) AS manager_category`,
    roleCol ? `CAST(\`${roleCol}\` AS STRING) AS role` : `CAST(NULL AS STRING) AS role`,
    instituteCol ? `CAST(\`${instituteCol}\` AS STRING) AS institute_name` : `CAST(NULL AS STRING) AS institute_name`,
  ].join(", ");
  const sql = `SELECT ${select} FROM \`${config.bigQuery.projectId}.${config.bigQuery.dataset}.${config.bigQuery.teachosTable}\``;
  const [rows] = await bq.query({ query: sql });

  const out: TeachosRow[] = [];
  for (const row of rows as any[]) {
    const instructorUid = clean(row.instructor_uid);
    if (!instructorUid) continue;
    out.push({
      instructorUid,
      managerUid: clean(row.manager_uid),
      managerName: clean(row.manager_name),
      managerCategory: clean(row.manager_category),
      role: clean(row.role),
      instituteName: clean(row.institute_name),
    });
  }
  return out;
}
