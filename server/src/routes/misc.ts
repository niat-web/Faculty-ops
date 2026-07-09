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

// Org chart tree: Org → Senior Managers → their Capability Managers. Every role is derived from the
// SAME live sources as the Roles page (never the stale User collection), so the chart and the Roles
// counts always agree:
//   Ops Admins        = Delivery Support department (getOpsAdminPeople)
//   Capability Mgrs   = the unique Darwinbox reporting managers, with live reportee counts (getReportingManagers)
//   Senior Managers   = the admin-curated list (SeniorManager collection)
// A CM is nested under a Senior Manager by resolving the CM's OWN Darwinbox manager (from the live feed)
// and matching it to a curated Senior Manager's Employee ID; the rest fall under "Unassigned".
// Each CM carries `rmid` (their Darwinbox employee-id) so clicking opens the Master filtered to them.
router.get("/org", async (req, res) => {
  if (!canViewAudit(req.user!)) return res.status(403).json({ error: "Forbidden" });
  const { loadLiveMasterRows } = await import("../lib/masterLive");
  const { getOpsAdminPeople, isInstructorDept, isOpsDept, darwinboxFullDirectory } = await import("../lib/staffRoles");
  const { SeniorManager, Instructor } = await import("../models");
  const { norm } = await import("../lib/darwinboxSync");
  const { maybeDecrypt } = await import("../lib/crypto");
  const [opsPeople, opsUsers, smDocs, live, mongoDocs, dir] = await Promise.all([
    getOpsAdminPeople(),                                              // live Delivery-Support people (Darwinbox)
    User.find({ role: Role.OPS_ADMIN }).select("name email").lean(), // Ops-Admin users stored in MongoDB
    SeniorManager.find().select("employeeId name").sort({ name: 1 }).lean(),
    loadLiveMasterRows(),
    Instructor.find({}).select("employeeId values").lean(),
    darwinboxFullDirectory(), // EVERY Darwinbox employee + their own manager (covers CMs not on the master)
  ]);

  const norm2 = (s: any) => norm(s);
  const rmidFromName = (s: any) => (String(s || "").match(/\((NW[^)]+)\)/i) || [])[1] || "";
  const stripName = (s: any) => String(s || "").replace(/\s*\(NW[^)]*\)\s*$/i, "").trim();

  // Ops Admins = the "Instructors – Delivery Support (Ops and Central managers)" department ONLY, taken
  // from BOTH sources and deduped so each person appears exactly once:
  //   1) live Darwinbox Delivery-Support people, and
  //   2) the Ops-Admin users already in MongoDB (role OPS_ADMIN).
  // A Mongo Ops-Admin user who is present in Darwinbox but in some OTHER department is rejected, so no
  // non-Delivery-Support person leaks into the Ops Admins node.
  const deptByEmail = new Map<string, string>((dir as any[]).map((p) => [norm2(p.email), p.department]));
  const opsMap = new Map<string, { id: string; name: string; email: string }>();
  const addOps = (name: any, email: any, employeeId: any) => {
    const key = norm2(email) || norm2(employeeId) || norm2(name);
    if (!key || opsMap.has(key)) return;
    opsMap.set(key, { id: `ops:${employeeId || email || key}`, name: name || email || employeeId, email: email || "" });
  };
  for (const p of opsPeople) addOps(p.name, p.email, p.employeeId);                 // strictly Delivery-Support
  for (const u of opsUsers as any[]) {
    const dept = deptByEmail.get(norm2(u.email));
    if (dept !== undefined && !isOpsDept(dept)) continue;                            // in Darwinbox but not Delivery-Support → skip
    addOps(u.name, u.email, "");
  }
  const opsAdmins = [...opsMap.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const liveRows: any[] = live.ok ? live.rows : [];
  // loadLiveMasterRows already unions Mongo-only instructors, so this covers Darwinbox + Mongo people.
  const activeInstr = liveRows.filter((r) => !r.exited && isInstructorDept(r.department));
  const totalInstructors = activeInstr.length;

  // normalised person name → their real Employee ID. Built from the FULL Darwinbox directory (every
  // employee) plus master rows, so a reporting-manager written as just a NAME (no "(NWxxxx)") still
  // resolves to one identity — the SAME manager never splits into an id-keyed and a name-keyed node.
  const nameToId = new Map<string, string>();
  const addName = (name: any, id: any) => { const n = norm2(stripName(name)); const e = String(id || "").trim(); if (n && e && !nameToId.has(n)) nameToId.set(n, e); };
  for (const p of dir as any[]) addName(p.name, p.employeeId);
  for (const r of liveRows) addName(r.name, r.employeeId);

  // Resolve any reporting-manager reference (id, "(NWxxxx)" in the name, or a bare name) to one Employee ID.
  const resolveRmid = (rmIdField: any, rmName: any): string => {
    const direct = String(rmIdField || rmidFromName(rmName) || "").trim();
    if (direct) return direct;
    return nameToId.get(norm2(stripName(rmName))) || "";
  };

  // employee → their OWN manager's Employee ID. Sourced FIRST from the full Darwinbox directory (has
  // EVERY employee incl. Capability Managers who aren't on the Instructor Master), then master rows and
  // MongoDB fill any gaps. This is what lets an off-master CM still nest under the correct Senior Manager.
  const empToManager = new Map<string, string>();
  for (const p of dir as any[]) {
    const e = norm2(p.employeeId); if (!e) continue;
    const mgr = norm2(p.managerEmployeeId) || norm2(nameToId.get(norm2(stripName(p.managerName))) || "");
    if (mgr) empToManager.set(e, mgr);
  }
  for (const r of liveRows) {
    const e = norm2(r.employeeId); if (!e || empToManager.has(e)) continue;
    const mgr = norm2(resolveRmid(r.reporting_manager_employee_id, r.reporting_manager));
    if (mgr) empToManager.set(e, mgr);
  }
  for (const d of mongoDocs as any[]) {
    const e = norm2(d.employeeId); if (!e || empToManager.has(e)) continue;
    const v = d.values || {};
    const mgr = norm2(resolveRmid(maybeDecrypt(v.reporting_manager_employee_id), maybeDecrypt(v.reporting_manager)));
    if (mgr) empToManager.set(e, mgr);
  }

  // Capability Managers = the unique reporting managers, keyed by Employee ID (NO duplicates), with a
  // live reportee count. Name variants of the same person collapse to one node via their Employee ID.
  const cmMap = new Map<string, { rmid: string; name: string; reportees: number }>();
  for (const r of activeInstr) {
    const rmid = resolveRmid(r.reporting_manager_employee_id, r.reporting_manager);
    const name = stripName(r.reporting_manager) || rmid;
    if (!rmid && !name) continue;
    const key = norm2(rmid) || `name:${norm2(name)}`; // one identity per Employee ID; name-key only when no id
    const ex = cmMap.get(key);
    if (ex) { ex.reportees++; if (!ex.rmid && rmid) ex.rmid = rmid; if (!ex.name && name) ex.name = name; }
    else cmMap.set(key, { rmid: rmid || "", name, reportees: 1 });
  }

  // Senior Managers (curated) — nodes keyed by their Employee ID, ready to receive their CMs.
  const smByEmp = new Map<string, any>();
  const seniors = (smDocs as any[]).map((s) => {
    const node = { id: `sm:${s.employeeId || s.name}`, name: s.name || s.employeeId, employeeId: norm2(s.employeeId), capabilityManagers: [] as any[] };
    if (node.employeeId) smByEmp.set(node.employeeId, node);
    return node;
  });

  // Nest each Capability Manager under the Senior Manager they report to. A person who is themselves a
  // curated Senior Manager is shown ONLY as the SM node (never also as a CM leaf → no duplicate).
  const unassignedCMs: any[] = [];
  let cmCount = 0;
  for (const cm of cmMap.values()) {
    const cmEmp = norm2(cm.rmid);
    if (cmEmp && smByEmp.has(cmEmp)) continue; // already rendered as a Senior Manager node
    cmCount++;
    const node = { id: `cm:${cm.rmid || cm.name}`, name: cm.name, rmid: cm.rmid, reportees: cm.reportees };
    const mgrEmp = cmEmp ? (empToManager.get(cmEmp) || "") : "";
    const sm = mgrEmp ? smByEmp.get(mgrEmp) : null;
    if (sm) sm.capabilityManagers.push(node); else unassignedCMs.push(node);
  }
  const byReportees = (a: any, b: any) => b.reportees - a.reportees || String(a.name).localeCompare(String(b.name));
  for (const s of seniors) s.capabilityManagers.sort(byReportees);
  unassignedCMs.sort(byReportees);

  res.json({
    totalInstructors,
    totalManagers: seniors.length + cmCount,
    opsAdmins,
    seniors: seniors.map(({ employeeId, ...s }) => s), // drop the internal employeeId from the payload
    unassignedCMs,
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
  const { getExitAlerts, getUniversities } = await import("../lib/settings");
  const { ExitAlert } = await import("../models");
  const [exitAlerts, universities, pending] = await Promise.all([getExitAlerts(), getUniversities(), ExitAlert.countDocuments({ status: "PENDING" })]);
  res.json({ exitAlerts, universities, counts: { pending } });
});
router.patch("/settings/exit-alerts", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { setExitAlerts, setUniversities, getExitAlerts, getUniversities } = await import("../lib/settings");
  const b = req.body || {};
  const exitAlerts = b.leadDays != null ? await setExitAlerts(b) : await getExitAlerts();
  const universities = Array.isArray(b.universities) ? await setUniversities(b.universities) : await getUniversities();
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "SETTINGS_CHANGE", fieldName: "Exit alert settings", newValue: `lead ${exitAlerts.leadDays}d · ${universities.length} universities`, reason: "Exit alert settings" });
  res.json({ exitAlerts, universities });
});

// ── Senior Managers (Ops only): admin-curated list, picked from Darwinbox ──
router.get("/settings/senior-managers", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { SeniorManager } = await import("../models");
  const list = await SeniorManager.find().sort({ name: 1 }).lean();
  res.json({ items: (list as any[]).map((s) => ({ employeeId: s.employeeId, name: s.name || "", email: s.email || "", department: s.department || "", designation: s.designation || "" })) });
});
// Search the full Darwinbox directory for the picker.
router.get("/settings/senior-managers/search", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { searchDarwinbox } = await import("../lib/staffRoles");
  res.json({ items: await searchDarwinbox(String(req.query.q || ""), 25) });
});
router.post("/settings/senior-managers", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const employeeId = String(req.body?.employeeId || "").trim();
  if (!employeeId) return res.status(400).json({ error: "Employee ID is required." });
  const { findDarwinboxEmployee, ensureStaffUser } = await import("../lib/staffRoles");
  const { SeniorManager } = await import("../models");
  const p = await findDarwinboxEmployee(employeeId);
  if (!p) return res.status(404).json({ error: "That Employee ID wasn't found in Darwinbox." });
  await SeniorManager.updateOne(
    { employeeId: p.employeeId },
    { $set: { name: p.name, email: p.email, department: p.department, designation: p.designation, addedById: req.user!.id, addedByName: req.user!.name } },
    { upsert: true }
  );
  // Mirror into a pending (inactive) Senior-Manager user account (login off until activated).
  const userResult = await ensureStaffUser({ name: p.name, email: p.email, role: Role.SENIOR_MANAGER });
  const { writeAudit } = await import("../lib/services");
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "USER_CREATE", fieldName: "Senior Manager added", newValue: `${p.name} (${p.employeeId})`, reason: "Senior Managers setting" });
  res.json({ ok: true, userAccount: userResult });
});
router.delete("/settings/senior-managers/:employeeId", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { SeniorManager } = await import("../models");
  await SeniorManager.deleteOne({ employeeId: String(req.params.employeeId || "").trim() });
  res.json({ ok: true });
});

// ── Ops Admins (Ops only): the Darwinbox "Delivery Support" department → pending user accounts ──
router.get("/settings/ops-admins", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { getOpsAdminPeople } = await import("../lib/staffRoles");
  res.json({ items: await getOpsAdminPeople() });
});
router.post("/settings/ops-admins/sync", async (req, res) => {
  if (req.user!.role !== Role.OPS_ADMIN) return res.status(403).json({ error: "Forbidden" });
  const { syncOpsAdminUsers } = await import("../lib/staffRoles");
  res.json({ ok: true, ...(await syncOpsAdminUsers()) });
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
