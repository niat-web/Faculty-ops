import { Router } from "express";
import { EditRequest, Instructor, User, AuditLog, LoginEvent } from "../models";
import { Role } from "../enums";
import { notify } from "../lib/services";
import { config } from "../config";

const router = Router();

// Gate: header x-cron-secret must match CRON_SECRET (skipped if none configured in dev).
router.use((req, res, next) => {
  if (config.cronSecret && req.headers["x-cron-secret"] !== config.cronSecret) return res.status(401).json({ error: "Unauthorized" });
  next();
});

// Reminders: nudge Senior Managers about pending edit requests + exits nearing last working day.
router.post("/reminders", async (_req, res) => {
  const pending = await EditRequest.aggregate([{ $match: { status: "PENDING" } }, { $group: { _id: "$approverId", n: { $sum: 1 } } }]);
  let sent = 0;
  for (const p of pending) {
    if (!p._id) continue;
    await notify(String(p._id), { type: "REMINDER", title: `You have ${p.n} pending edit request(s)`, body: "Review and approve or reject them.", link: "/app/requests" });
    sent++;
  }

  // Exits with a last working day within 7 days.
  const soon = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const exiting = await Instructor.find({ status: "EXIT_IN_PROGRESS", "exit.lastWorkingDay": { $gte: today, $lte: soon } }).select("name currentManagerId exit").lean();
  for (const inst of exiting as any[]) {
    if (inst.currentManagerId) { await notify(String(inst.currentManagerId), { type: "REMINDER", title: `${inst.name} exits on ${inst.exit.lastWorkingDay}`, body: "Complete the offboarding checklist.", link: "/app/instructors" }); sent++; }
  }
  res.json({ ok: true, sent });
});

// Weekly digest: per Senior Manager summary of their org.
router.post("/digest", async (_req, res) => {
  const sms = await User.find({ role: Role.SENIOR_MANAGER, active: true }).select("name").lean();
  let sent = 0;
  for (const sm of sms as any[]) {
    const [pending, reportees] = await Promise.all([
      EditRequest.countDocuments({ approverId: sm._id, status: "PENDING" }),
      User.countDocuments({ managerId: sm._id, role: Role.CAPABILITY_MANAGER }),
    ]);
    await notify(String(sm._id), { type: "REMINDER", title: "Your weekly summary", body: `${pending} pending request(s) · ${reportees} Capability Manager(s).`, link: "/app" });
    sent++;
  }
  res.json({ ok: true, sent });
});

// Recompute every instructor's training summary (%, Health, Predicted) so time-derived
// values (e.g. a deadline that just passed) don't go stale between cell edits. (Bug B1)
router.post("/recompute-summaries", async (_req, res) => {
  const { recomputeInstructorSummary, liveTrackKeysFromDB } = await import("../lib/training");
  const live = await liveTrackKeysFromDB();
  const docs = await Instructor.find().select("values moduleStatus");
  let updated = 0;
  for (const inst of docs as any[]) { if (await recomputeInstructorSummary(inst, live)) { await inst.save(); updated++; } }
  res.json({ ok: true, scanned: docs.length, updated });
});

// BigQuery → Mongo training persist (scheduled): same engine as the in-process hourly job.
// Keeps values.primary_pct / moduleStatus fresh so the Master serves training % from MongoDB.
router.post("/training-sync", async (_req, res) => {
  const { persistBigQueryTraining } = await import("../lib/trainingSync");
  const report = await persistBigQueryTraining();
  res.status(report.ok ? 200 : 502).json(report);
});

// Darwinbox → Instructor Master sync (scheduled): same engine as the manual Data-page sync.
// Department-scoped, Employee ID keyed; Darwinbox wins on synced fields only.
router.post("/darwinbox-sync", async (_req, res) => {
  const { applyDarwinboxSync } = await import("../lib/darwinboxSync");
  // Attribute the run to an active Ops Admin when one exists (keeps audit rows linkable).
  const ops: any = await User.findOne({ role: Role.OPS_ADMIN, active: true }).select("name email").lean();
  const actor = ops
    ? { id: String(ops._id), name: `${ops.name} (Darwinbox cron)`, email: ops.email, role: Role.OPS_ADMIN, managerId: null }
    : { id: null as any, name: "System (Darwinbox cron)", email: "", role: Role.OPS_ADMIN, managerId: null };
  const report = await applyDarwinboxSync(actor, true);
  res.status(report.ok ? 200 : 502).json(report);
});

// Retention: prune audit + login history older than RETENTION_DAYS (0 = keep forever).
router.post("/prune", async (_req, res) => {
  const { getData } = await import("../lib/settings");
  const days = (await getData()).retentionDays; // admin-set (Settings → Data), falls back to RETENTION_DAYS env
  if (!days || days <= 0) return res.json({ ok: true, pruned: 0, note: "Retention disabled (keep forever)" });
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const [audit, logins] = await Promise.all([
    AuditLog.deleteMany({ createdAt: { $lt: cutoff } }),
    LoginEvent.deleteMany({ at: { $lt: cutoff } }),
  ]);
  res.json({ ok: true, prunedAudit: audit.deletedCount || 0, prunedLogins: logins.deletedCount || 0, cutoff });
});

export default router;
