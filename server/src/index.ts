import "express-async-errors"; // makes thrown errors in async handlers reach the error middleware
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { config } from "./config";
import { connectDB, disconnectDB } from "./db";
import { attachUser, enforceRoleAccess } from "./middleware";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import instructorRoutes from "./routes/instructors";
import fieldRoutes from "./routes/fields";
import requestRoutes from "./routes/requests";
import mappingRoutes from "./routes/mapping";
import miscRoutes from "./routes/misc";
import cronRoutes from "./routes/cron";
import trainingRoutes from "./routes/training";
import contributionRoutes from "./routes/contribution";
import masterRoutes from "./routes/master";
import dataRoutes from "./routes/data";
import exitAlertRoutes from "./routes/exitAlerts";

async function main() {
  await connectDB();
  const app = express();

  app.set("trust proxy", 1); // behind Northflank/Vercel TLS proxy — needed for secure cookies + real IPs
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  if (config.isProd) app.use(morgan("combined")); else app.use(morgan("dev"));
  app.use(cors({ origin: config.clientUrls, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(attachUser); // attaches req.user when a valid session cookie is present

  // Liveness (process up) vs readiness (can serve traffic / DB connected).
  app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.get("/api/ready", (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ ok: up, db: up ? "connected" : "down" });
  });

  // Rate limit ONLY the sensitive auth actions (above the per-account DB lockout) to blunt brute force.
  // NOT the whole /api/auth — /auth/me and /auth/google/status are polled/idempotent and must stay unlimited.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Please try again later." } });
  // Block disabled-role sessions on every /api route (lets /auth/* through to recover).
  app.use("/api", enforceRoleAccess);
  app.use(["/api/auth/login", "/api/auth/forgot", "/api/auth/reset"], authLimiter);
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/instructors", instructorRoutes);
  app.use("/api/master", masterRoutes);
  app.use("/api/fields", fieldRoutes);
  app.use("/api/requests", requestRoutes);
  app.use("/api/mapping", mappingRoutes);
  app.use("/api/training", trainingRoutes);
  app.use("/api/contribution", contributionRoutes);
  app.use("/api/data", dataRoutes); // raw BigQuery/Darwinbox browser (Data page, Ops only)
  app.use("/api/exit-alerts", exitAlertRoutes); // Darwinbox-driven exit alerts (banner + finalise)
  app.use("/api/cron", cronRoutes); // reminders, digest (x-cron-secret gated)
  app.use("/api", miscRoutes); // dashboard, org, audit, notifications, settings, saved views

  // 404 + error handlers
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = Number(err?.status) || 500;
    console.error("[error]", status, err?.message || err);
    // Don't leak internal error details for 5xx — only surface our own 4xx messages.
    res.status(status).json({ error: status < 500 && err?.message ? err.message : "Server error" });
  });

  const server = app.listen(config.port, () => console.log(`[server] API listening on http://localhost:${config.port}`));

  // Keep the Instructor Master fresh from Darwinbox on a schedule (in-process; env-gated).
  const { startDarwinboxAutoSync, stopDarwinboxAutoSync } = await import("./lib/darwinboxScheduler");
  startDarwinboxAutoSync();

  // Graceful shutdown: stop accepting, drain in-flight, close the DB pool.
  const shutdown = async (sig: string) => {
    console.log(`[server] ${sig} received — shutting down`);
    stopDarwinboxAutoSync();
    server.close(async () => { try { await disconnectDB(); } catch {} process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
