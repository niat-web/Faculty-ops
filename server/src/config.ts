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
}

if (problems.length) {
  if (isProd) {
    console.error("[config] FATAL — invalid configuration:\n  - " + problems.join("\n  - "));
    process.exit(1);
  } else {
    console.warn("[config] " + problems.join("; "));
  }
}
