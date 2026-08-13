import dotenv from "dotenv";
dotenv.config();

const DEFAULT_JWT = "dev-secret-change-me-32-chars-minimum-please!";
const isProd = process.env.NODE_ENV === "production";

export const config = {
  mongoUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me-32-chars-minimum-please!",
  port: Number(process.env.PORT || 4000),
  clientUrls: (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean),
  appUrl: (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  cronSecret: process.env.CRON_SECRET || "",
  retentionDays: Number(process.env.RETENTION_DAYS || 0),
  bigQuery: {
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    projectId: process.env.BIGQUERY_PROJECT_ID || "",
    dataset: process.env.BIGQUERY_DATASET || "",
    table: process.env.BIGQUERY_TABLE || "",
    // TeachOS instructor/manager table — same dataset/project/credentials as the training table
    // above, just a different table name (see lib/teachosBigQuery.ts).
    teachosTable: process.env.BIGQUERY_TEACHOS_TABLE || "",
  },
  // Google Drive — certificate uploads land in this (Shared Drive) folder, using the same
  // service-account credentials as BigQuery. Files are made "anyone with the link (viewer)".
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
  driveCertFolderId: process.env.GDRIVE_CERTIFICATES_FOLDER_ID || "",
  // Mistral (OpenAI-compatible) — powers the Dashboard AI assistant. Model supports tool-calling;
  // all data access is role-scoped server-side. When MISTRAL_API_KEY is unset the assistant
  // endpoint returns a clear "not configured" message instead of failing.
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY || "",
    model: process.env.MISTRAL_MODEL || "ministral-3b-2512",
    baseUrl: (process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1").replace(/\/$/, ""),
  },
  darwinbox: {
    endpoint: process.env.DARWINBOX_ENDPOINT || "",
    username: process.env.DARWINBOX_USERNAME || "",
    password: process.env.DARWINBOX_PASSWORD || "",
    apiKey: process.env.DARWINBOX_API_KEY || "",
    datasetKey: process.env.DARWINBOX_DATASET_KEY || "",
    // Auto-sync interval in hours (0 = disabled). Every tick pulls Darwinbox → MongoDB so the whole
    // app serves fast from Mongo; default 1h.
    syncIntervalHours: Number(process.env.DARWINBOX_SYNC_INTERVAL_HOURS ?? 1),
  },
  // Separate, dedicated credentials for the standalone Darwinbox Check page — kept fully independent
  // from the main `darwinbox` integration above so testing keys never affects the live sync.
  // This page targets the Report Builder API (reportsbuilderapi/reportdatav2) so it can return a
  // pre-filtered report — e.g. an "exited employees only" report — instead of all employees.
  darwinboxCheck: {
    endpoint: process.env.DBX_CHECK_ENDPOINT || "",
    username: process.env.DBX_CHECK_USERNAME || "",
    password: process.env.DBX_CHECK_PASSWORD || "",
    apiKey: process.env.DBX_CHECK_API_KEY || "",
    reportId: process.env.DBX_CHECK_REPORT_ID || "",
    // Keep only rows whose `statusColumn` value is in this comma list (real leavers only) — the
    // "deactivated" report includes Revoked/Rejected/Pending too. Blank = no status filtering.
    statusColumn: process.env.DBX_CHECK_STATUS_COLUMN || "Status",
    statusInclude: process.env.DBX_CHECK_STATUS_INCLUDE ?? "Approved,Admin Approved",
    // Detail reports whose columns (department, designation, email, mobile, manager, exit category…)
    // are JOINED onto each exited employee by Employee Id — the base report has only a few columns.
    // Order = priority (first non-empty value wins). Default: EIF Main, TA Employee Master,
    // Offboarding tracking, L&D Details. Blank disables enrichment. Add EMPLOYEE_MASTER's id for
    // full personal fields (PAN/Aadhaar/passport) if desired.
    enrichReportIds: process.env.DBX_CHECK_ENRICH_REPORT_IDS ?? "70c916bd0ed8bb,1d513a4ccdf2e8,9feb118d44726a,853905cf311922",
  },
  isProd,
};

// Fail fast on insecure / broken configuration in production rather than
// booting with a forgeable session secret or no database.
const problems: string[] = [];
if (!config.mongoUri) problems.push("MONGODB_URI is required");
if (isProd) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT) problems.push("JWT_SECRET must be set to a unique value in production");
  if (config.jwtSecret.length < 32) problems.push("JWT_SECRET must be at least 32 characters");
  if (!config.clientUrls.length) problems.push("CLIENT_URL must be set in production");
  for (const u of config.clientUrls) if (!/^https:\/\//.test(u)) problems.push(`CLIENT_URL origin must be https in production: ${u}`);
  if (!config.cronSecret) problems.push("CRON_SECRET is required in production");
  if (!process.env.ENCRYPTION_KEY) problems.push("ENCRYPTION_KEY is required in production (2FA secrets + sensitive fields)");
}

if (problems.length) {
  if (isProd) {
    console.error("[config] FATAL — invalid configuration:\n  - " + problems.join("\n  - "));
    process.exit(1);
  } else {
    console.warn("[config] " + problems.join("; "));
  }
}
