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
router.get("/dashboard", async (req, res) => res.json(await dashboardData(req.user!)));

// Org chart tree: Org → Senior Managers → their Capability Managers.
router.get("/org", async (req, res) => {
  if (!canViewAudit(req.user!)) return res.status(403).json({ error: "Forbidden" });
  const [sms, cms, counts, totalInstructors] = await Promise.all([
    User.find({ role: Role.SENIOR_MANAGER, active: true }).select("name").sort({ name: 1 }).lean(),
    User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name managerId").sort({ name: 1 }).lean(),
    Instructor.aggregate([{ $group: { _id: "$currentManagerId", n: { $sum: 1 } } }]),
    Instructor.countDocuments(),
  ]);
  const countByCm = Object.fromEntries(counts.map((c: any) => [String(c._id), c.n]));
  res.json({
    totalInstructors, totalManagers: sms.length + cms.length,
    seniors: sms.map((s: any) => ({
      id: String(s._id), name: s.name,
      capabilityManagers: cms.filter((c: any) => String(c.managerId) === String(s._id)).map((c: any) => ({ id: String(c._id), name: c.name, reportees: countByCm[String(c._id)] || 0 })),
    })),
    unassignedCMs: cms.filter((c: any) => !c.managerId).map((c: any) => ({ id: String(c._id), name: c.name, reportees: countByCm[String(c._id)] || 0 })),
  });
});

// Audit log CSV export (Ops/SM), honors the same q/action filters.
router.get("/audit/export.csv", async (req, res) => {
  if (!canViewAudit(req.user!)) return res.status(403).json({ error: "Forbidden" });
  const q = String(req.query.q || "").trim();
  const action = String(req.query.action || "").trim();
  const filter: any = {};
  if (action) filter.action = action;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ instructorName: rx }, { actorName: rx }, { fieldName: rx }, { reason: rx }]; }
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
  const q = String(req.query.q || "").trim();
  const action = String(req.query.action || "").trim();
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const reqPer = parseInt(String(req.query.per || ""), 10);
  const PER = [50, 100, 200, 500].includes(reqPer) ? reqPer : 50;
  const filter: any = {};
  if (action) filter.action = action;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ instructorName: rx }, { actorName: rx }, { fieldName: rx }, { reason: rx }]; }
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
  res.setHeader("Content-Disposition", "inline");
  downloadStream(req.params.fileId).on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); }).pipe(res);
});

// Notifications.
router.get("/notifications", async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(100).lean(),
    Notification.countDocuments({ userId: req.user!.id, read: false }),
  ]);
  res.json({ items: items.map((n: any) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, read: n.read, createdAt: n.createdAt })), unread });
});
router.get("/notifications/count", async (req, res) => res.json({ count: await Notification.countDocuments({ userId: req.user!.id, read: false }) }));
router.post("/notifications/read", async (req, res) => { await Notification.updateMany({ userId: req.user!.id, read: false }, { $set: { read: true } }); res.json({ ok: true }); });

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
    const i = passwordIssue(newPassword); if (i) return res.status(400).json({ error: i });
    me.passwordHash = await hashPassword(newPassword); me.mustSetPassword = false;
  }
  await me.save();
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
