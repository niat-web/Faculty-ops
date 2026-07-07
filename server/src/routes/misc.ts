import { Router } from "express";
import Papa from "papaparse";
import { Instructor, User, AuditLog, Notification, EditRequest } from "../models";
import { Role } from "../enums";
import { canViewAudit } from "../lib/rbac";
import { dashboardData } from "../lib/analytics";
import { escapeRegex } from "../lib/text";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());

// Dashboard (role-aware).
// ?live=1 → BigQuery-blocking dashboard with a FRESH read (no cached/stale result). The Dashboard page
// always calls with live=1 and waits, so it renders the latest BigQuery numbers exactly once.
router.get("/dashboard", async (req, res) => {
  const live = String(req.query.live || "") === "1";
  res.json(await dashboardData(req.user!, live, live ? { fresh: true } : undefined));
});

// Org chart tree: Org → Senior Managers → their Capability Managers.
router.get("/org", async (req, res) => {
  if (!canViewAudit(req.user!)) return res.status(403).json({ error: "Forbidden" });
  const [ops, sms, cms, counts, totalInstructors] = await Promise.all([
    User.find({ role: Role.OPS_ADMIN, active: true }).select("name email").sort({ name: 1 }).lean(),
    User.find({ role: Role.SENIOR_MANAGER, active: true }).select("name").sort({ name: 1 }).lean(),
    User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name managerId").sort({ name: 1 }).lean(),
    Instructor.aggregate([{ $group: { _id: "$currentManagerId", n: { $sum: 1 } } }]),
    Instructor.countDocuments(),
  ]);
  const countByCm = Object.fromEntries(counts.map((c: any) => [String(c._id), c.n]));
  res.json({
    totalInstructors, totalManagers: sms.length + cms.length,
    opsAdmins: ops.map((o: any) => ({ id: String(o._id), name: o.name, email: o.email })),
    seniors: sms.map((s: any) => ({
      id: String(s._id), name: s.name,
      capabilityManagers: cms.filter((c: any) => String(c.managerId) === String(s._id)).map((c: any) => ({ id: String(c._id), name: c.name, reportees: countByCm[String(c._id)] || 0 })),
    })),
    unassignedCMs: cms.filter((c: any) => !c.managerId).map((c: any) => ({ id: String(c._id), name: c.name, reportees: countByCm[String(c._id)] || 0 })),
  });
});

// Filters accept comma-separated values (single or multi).
const listParam = (v: any) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const inOrEq = (vals: string[]) => (vals.length > 1 ? { $in: vals } : vals[0]);

// Shared audit filter: search + action + actor + department/manager (resolved via the instructor) + date range.
async function buildAuditFilter(req: any): Promise<any> {
  const q = String(req.query.q || "").trim();
  const actions = listParam(req.query.action);
  const actors = listParam(req.query.actorRole);
  const departments = listParam(req.query.department);
  const managers = listParam(req.query.managerId);
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const filter: any = {};
  if (actions.length) filter.action = inOrEq(actions);
  if (actors.length) filter.actorRole = inOrEq(actors);
  // Department / Capability Manager → resolve matching instructorIds, then scope the audit rows.
  if (departments.length || managers.length) {
    const iq: any = {};
    if (departments.length) iq["values.department"] = inOrEq(departments);
    if (managers.length) iq.currentManagerId = inOrEq(managers);
    const ids = (await Instructor.find(iq).select("_id").limit(50000).lean()).map((i: any) => i._id);
    filter.instructorId = { $in: ids };
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) { const d = new Date(from); if (!isNaN(d.getTime())) filter.createdAt.$gte = d; }
    if (to) { const d = new Date(to); if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); filter.createdAt.$lte = d; } }
  }
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ instructorName: rx }, { actorName: rx }, { fieldName: rx }, { reason: rx }, { oldValue: rx }, { newValue: rx }]; }
  return filter;
}

// Audit log CSV export (Ops/SM), honors the same filters.
router.get("/audit/export.csv", async (req, res) => {
  if (!canViewAudit(req.user!)) return res.status(403).json({ error: "Forbidden" });
  const filter = await buildAuditFilter(req);
  const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(20000).lean();
  const data = rows.map((a: any) => ({
    when: new Date(a.createdAt).toISOString(), action: a.action, instructor: a.instructorName || "",
    field: a.fieldName || "", oldValue: a.oldValue || "", newValue: a.newValue || "", by: a.actorName || "", role: a.actorRole || "", reason: a.reason || "",
  }));
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log.csv"`);
  res.send(Papa.unparse(data));
});

// Audit log (Ops/SM), paginated + filtered.
router.get("/audit", async (req, res) => {
  if (!canViewAudit(req.user!)) return res.status(403).json({ error: "Forbidden" });
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const reqPer = parseInt(String(req.query.per || ""), 10);
  const PER = [50, 100, 200, 500, 1000].includes(reqPer) ? reqPer : 50;
  const filter = await buildAuditFilter(req);
  const [total, rows] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PER).limit(PER).lean(),
  ]);
  res.json({ total, page, per: PER, pages: Math.max(1, Math.ceil(total / PER)), entries: rows.map((a: any) => ({ id: String(a._id), instructorName: a.instructorName, actorName: a.actorName, actorRole: a.actorRole, action: a.action, fieldName: a.fieldName, oldValue: a.oldValue, newValue: a.newValue, reason: a.reason, proofPath: a.proofPath || null, createdAt: a.createdAt })) });
});

// Stream a proof file referenced by an audit entry (Ops/SM only).
// The id MUST correspond to a real AuditLog.proofPath — never stream an arbitrary
// GridFS id (instructor documents live in the same bucket → would be an IDOR).
router.get("/audit/proof/:fileId", async (req, res) => {
  if (!canViewAudit(req.user!)) return res.status(403).json({ error: "Forbidden" });
  const exists = await AuditLog.exists({ proofPath: req.params.fileId });
  if (!exists) return res.status(404).json({ error: "Not found" });
  const { downloadStream } = await import("../lib/storage");
  // Force a download with a neutral type so an uploaded HTML/SVG can't render/execute in the browser. (Bug B3)
  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  downloadStream(req.params.fileId).on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); }).pipe(res);
});

// Notifications.
router.get("/notifications", async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100)); // dropdown can ask for fewer
  const [items, unread] = await Promise.all([
    Notification.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId: req.user!.id, read: false }),
  ]);
  res.json({ items: items.map((n: any) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, read: n.read, createdAt: n.createdAt })), unread });
});
router.get("/notifications/count", async (req, res) => res.json({ count: await Notification.countDocuments({ userId: req.user!.id, read: false }) }));
router.post("/notifications/read", async (req, res) => { await Notification.updateMany({ userId: req.user!.id, read: false }, { $set: { read: true } }); res.json({ ok: true }); });
// Mark a single notification read/unread (owner only).
router.patch("/notifications/:id", async (req, res) => {
  const read = req.body?.read !== false; // default true
  const r = await Notification.updateOne({ _id: req.params.id, userId: req.user!.id }, { $set: { read } });
  if (!r.matchedCount) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});
// Delete a single notification (owner only).
router.delete("/notifications/:id", async (req, res) => {
  const r = await Notification.deleteOne({ _id: req.params.id, userId: req.user!.id });
  if (!r.deletedCount) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// --- Account Access (Ops only): enable/disable portal access for whole roles ---
router.get("/settings/role-access", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { getRoleAccess } = await import("../lib/settings");
  res.json({ roleAccess: await getRoleAccess() });
});
router.patch("/settings/role-access", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { role, enabled } = req.body || {};
  const { ROLES, setRoleAccess } = await import("../lib/settings");
  if (!(ROLES as readonly string[]).includes(role)) return res.status(400).json({ error: "Unknown role" });
  if (role === "OPS_ADMIN" && enabled === false) return res.status(400).json({ error: "Ops Admin access can't be disabled." });
  const roleAccess = await setRoleAccess(role, !!enabled);
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "ROLE_ACCESS_CHANGE", fieldName: role, newValue: enabled ? "enabled" : "disabled", reason: "Account Access setting" });
  res.json({ roleAccess });
});

// Email control center (Ops only) — per-event on/off, grouped by recipient role.
router.get("/settings/emails", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { EMAIL_EVENTS, getEmailSettings } = await import("../lib/settings");
  res.json({ events: EMAIL_EVENTS, settings: await getEmailSettings() });
});
router.patch("/settings/emails", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { key, enabled } = req.body || {};
  const { EMAIL_EVENTS, setEmailSetting } = await import("../lib/settings");
  if (!EMAIL_EVENTS.some((e) => e.key === key)) return res.status(400).json({ error: "Unknown email event" });
  const settings = await setEmailSetting(key, !!enabled);
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "ROLE_ACCESS_CHANGE", fieldName: `Email: ${key}`, newValue: enabled ? "enabled" : "disabled", reason: "Email setting" });
  res.json({ settings });
});

// ── In-app notification control center (Ops only) — per-event on/off ──
router.get("/settings/notifications", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { NOTIFY_EVENTS, getNotifySettings } = await import("../lib/settings");
  res.json({ events: NOTIFY_EVENTS, settings: await getNotifySettings() });
});
router.patch("/settings/notifications", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { key, enabled } = req.body || {};
  const { NOTIFY_EVENTS, setNotifySetting } = await import("../lib/settings");
  if (!NOTIFY_EVENTS.some((e) => e.key === key)) return res.status(400).json({ error: "Unknown notification event" });
  const settings = await setNotifySetting(key, !!enabled);
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "SETTINGS_CHANGE", fieldName: `Notification: ${key}`, newValue: enabled ? "enabled" : "disabled", reason: "Notification setting" });
  res.json({ settings });
});

// ── General / branding (Ops only) ──
router.get("/settings/general", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { getGeneral } = await import("../lib/settings");
  const { config } = await import("../config");
  // Read-only integration status (derived from the server environment, not editable here).
  const integrations = {
    email: !!(process.env.AWS_ACCESS_KEY_ID && process.env.SES_FROM_EMAIL),
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    encryption: !!process.env.ENCRYPTION_KEY,
    cron: !!config.cronSecret,
  };
  res.json({ general: await getGeneral(), integrations });
});
router.patch("/settings/general", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const b = req.body || {};
  const patch: Record<string, any> = {};
  if (typeof b.appName === "string") patch.appName = b.appName.trim().slice(0, 60);
  if (typeof b.organisation === "string") patch.organisation = b.organisation.trim().slice(0, 80);
  if (typeof b.appUrl === "string") patch.appUrl = b.appUrl.trim().slice(0, 200);
  if (typeof b.supportEmail === "string") patch.supportEmail = b.supportEmail.trim().slice(0, 120);
  if (patch.appName === "") return res.status(400).json({ error: "App name can't be empty." });
  if (patch.supportEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.supportEmail)) return res.status(400).json({ error: "Support email is not valid." });
  if (patch.appUrl && !/^https?:\/\//.test(patch.appUrl)) return res.status(400).json({ error: "App URL must start with http:// or https://" });
  const { setGeneral } = await import("../lib/settings");
  const general = await setGeneral(patch);
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "SETTINGS_CHANGE", fieldName: "General settings", newValue: JSON.stringify(patch), reason: "General settings" });
  res.json({ general });
});

// ── Security policy (Ops only) ──
router.get("/settings/security", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { getSecurity } = await import("../lib/settings");
  res.json({ security: await getSecurity() });
});
router.patch("/settings/security", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { setSecurity } = await import("../lib/settings");
  const security = await setSecurity(req.body || {});
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "SETTINGS_CHANGE", fieldName: "Security policy", newValue: JSON.stringify(security), reason: "Security settings" });
  res.json({ security });
});

// ── Data & retention (Ops only) ──
router.get("/settings/data", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { getData } = await import("../lib/settings");
  const { LoginEvent } = await import("../models");
  const [data, audit, notifications, logins] = await Promise.all([
    getData(),
    AuditLog.estimatedDocumentCount(),
    Notification.estimatedDocumentCount(),
    LoginEvent.estimatedDocumentCount(),
  ]);
  res.json({ data, counts: { audit, notifications, logins } });
});
router.patch("/settings/data", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { setData } = await import("../lib/settings");
  const data = await setData(req.body || {});
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "SETTINGS_CHANGE", fieldName: "Data retention", newValue: `${data.retentionDays} days`, reason: "Data settings" });
  res.json({ data });
});
// Manual prune NOW (Ops only) — same logic as the secret-gated cron, but session-authenticated.
router.post("/settings/data/prune", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { getData } = await import("../lib/settings");
  const days = (await getData()).retentionDays;
  if (!days || days <= 0) return res.json({ ok: true, prunedAudit: 0, prunedLogins: 0, note: "Retention is set to keep forever — nothing pruned." });
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const { LoginEvent } = await import("../models");
  const [audit, logins] = await Promise.all([
    AuditLog.deleteMany({ createdAt: { $lt: cutoff } }),
    LoginEvent.deleteMany({ at: { $lt: cutoff } }),
  ]);
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "SETTINGS_CHANGE", fieldName: "Manual prune", newValue: `audit ${audit.deletedCount || 0}, logins ${logins.deletedCount || 0}`, reason: `Older than ${days} days` });
  res.json({ ok: true, prunedAudit: audit.deletedCount || 0, prunedLogins: logins.deletedCount || 0, cutoff });
});

// ── Exit alerts (Ops only): how many days before a last-working-day to raise an alert ──
router.get("/settings/exit-alerts", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { getExitAlerts } = await import("../lib/settings");
  const { ExitAlert } = await import("../models");
  const [exitAlerts, pending] = await Promise.all([getExitAlerts(), ExitAlert.countDocuments({ status: "PENDING" })]);
  res.json({ exitAlerts, counts: { pending } });
});
router.patch("/settings/exit-alerts", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { setExitAlerts } = await import("../lib/settings");
  const exitAlerts = await setExitAlerts(req.body || {});
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "SETTINGS_CHANGE", fieldName: "Exit alert lead days", newValue: `${exitAlerts.leadDays} days`, reason: "Exit alert settings" });
  res.json({ exitAlerts });
});

// Account overview (read-only profile + email-notification preference).
router.get("/settings", async (req, res) => {
  const me: any = await User.findById(req.user!.id).lean();
  if (!me) return res.status(404).json({ error: "Not found" });
  let managerName: string | null = null;
  if (me.managerId) { const m: any = await User.findById(me.managerId).select("name").lean(); managerName = m?.name || null; }
  res.json({ name: me.name, email: me.email, role: me.role, managerName, emailNotifications: me.emailNotifications !== false });
});

// Settings: update own profile (name / password / email-notification preference).
router.patch("/settings/profile", async (req, res) => {
  const { name, newPassword, currentPassword, emailNotifications } = req.body || {};
  const me: any = await User.findById(req.user!.id);
  if (!me) return res.status(404).json({ error: "Not found" });
  if (typeof name === "string" && name.trim()) me.name = name.trim();
  if (typeof emailNotifications === "boolean") me.emailNotifications = emailNotifications;
  if (newPassword) {
    const { passwordIssue, hashPassword, verifyPassword } = await import("../lib/auth");
    // Require the current password to change it (unless the user has never set one).
    if (!me.mustSetPassword) {
      if (!currentPassword || !(await verifyPassword(currentPassword, me.passwordHash))) return res.status(401).json({ error: "Current password is incorrect." });
    }
    const { getSecurity } = await import("../lib/settings");
    const sec = await getSecurity();
    const i = passwordIssue(newPassword, { minLength: sec.passwordMinLength, requireComplexity: sec.requireComplexity }); if (i) return res.status(400).json({ error: i });
    me.passwordHash = await hashPassword(newPassword); me.mustSetPassword = false;
    me.passwordChangedAt = new Date(); // invalidate other sessions (Security)
  }
  await me.save();
  // Re-issue THIS session's cookie so the user who just changed their own password stays signed in.
  if (newPassword) { const { signSession, setSessionCookie } = await import("../lib/auth"); setSessionCookie(res, signSession(me)); }
  res.json({ ok: true });
});

// Saved filter views (max 20/user).
router.get("/settings/views", async (req, res) => {
  const me: any = await User.findById(req.user!.id).select("savedViews").lean();
  res.json({ views: (me?.savedViews || []).map((v: any) => ({ id: String(v._id), name: v.name, query: v.query })) });
});
router.post("/settings/views", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const query = String(req.body?.query || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });
  const me: any = await User.findById(req.user!.id);
  if (!me) return res.status(404).json({ error: "Not found" });
  if ((me.savedViews?.length || 0) >= 20) return res.status(400).json({ error: "You can save at most 20 views." });
  me.savedViews.push({ name, query });
  await me.save();
  res.json({ ok: true });
});
router.delete("/settings/views/:id", async (req, res) => {
  const me: any = await User.findById(req.user!.id);
  if (!me) return res.status(404).json({ error: "Not found" });
  const v = me.savedViews.id(req.params.id);
  if (v) { v.deleteOne(); await me.save(); }
  res.json({ ok: true });
});

export default router;
