import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User, Instructor } from "../models";
import { Role } from "../enums";
import { hashPassword, passwordIssue } from "../lib/auth";
import { getSecurity } from "../lib/settings";
import { canManageUsers } from "../lib/rbac";
import { writeAudit } from "../lib/services";
import { inviteUser, buildSetPasswordLink, sendSetPasswordEmail } from "../lib/invites";
import { makeResetToken } from "../lib/crypto";
import { escapeRegex } from "../lib/text";
import { requireUser } from "../middleware";
import { config } from "../config";

const router = Router();
router.use(requireUser());
const opsOnly = (req: any, res: any, next: any) => (canManageUsers(req.user) ? next() : res.status(403).json({ error: "Forbidden" }));

// List users (paginated + filtered).
router.get("/", opsOnly, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const role = String(req.query.role || "").trim();
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const reqPer = parseInt(String(req.query.per || ""), 10);
  const PER = [50, 100, 200, 500, 1000].includes(reqPer) ? reqPer : 50;
  const managerId = String(req.query.managerId || "").trim(); // "Reports to" filter
  const status = String(req.query.status || "").trim();        // active | pending | inactive
  const live = String(req.query.live || "").trim();            // live | offline (presence)
  const query: any = {};
  if (role) query.role = role;
  // Cast to ObjectId — the aggregation's $match does NOT auto-cast like countDocuments/find does,
  // so a raw string would count rows but return none (mismatch). (Bug)
  if (managerId) query.managerId = mongoose.isValidObjectId(managerId) ? new mongoose.Types.ObjectId(managerId) : managerId;
  // Account status filter.
  if (status === "active") { query.active = true; query.mustSetPassword = { $ne: true }; }
  else if (status === "pending") { query.active = true; query.mustSetPassword = true; }
  else if (status === "inactive") query.active = false;
  // Combine the (possibly two) $or groups — search vs offline presence — under $and so neither is lost.
  const and: any[] = [];
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); and.push({ $or: [{ name: rx }, { email: rx }] }); }
  const liveCutoff = new Date(Date.now() - 5 * 60 * 1000);
  if (live === "live") query.lastSeenAt = { $gte: liveCutoff };
  else if (live === "offline") and.push({ $or: [{ lastSeenAt: null }, { lastSeenAt: { $exists: false } }, { lastSeenAt: { $lt: liveCutoff } }] });
  if (and.length) query.$and = and;

  // Custom role ordering for the table: Ops Admin → Senior Manager → Capability Manager → Instructor.
  // Done in the DB (not after fetch) so it stays correct across pagination.
  const ROLE_ORDER = [Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER, Role.INSTRUCTOR];
  // 3-state column sort (overrides the default role-rank ordering when set).
  const SORTABLE = new Set(["name", "email", "role", "createdAt", "lastLoginAt", "lastSeenAt"]);
  const sortKey = String(req.query.sort || ""); const sortDir = String(req.query.dir || "");
  const sortStage: Record<string, 1 | -1> = sortKey && SORTABLE.has(sortKey) && sortDir
    ? { [sortKey]: sortDir === "desc" ? -1 : 1 } : { _roleRank: 1, name: 1 };
  const [total, users, seniors, managers] = await Promise.all([
    User.countDocuments(query),
    User.aggregate([
      { $match: query },
      { $addFields: { _roleRank: { $indexOfArray: [ROLE_ORDER, "$role"] } } },
      { $sort: sortStage },
      { $skip: (page - 1) * PER },
      { $limit: PER },
    ]),
    User.find({ role: Role.SENIOR_MANAGER }).select("name").sort({ name: 1 }).lean(),
    // Anyone who can be a "Reports to" target (SMs + CMs) — for the reports-to filter.
    User.find({ role: { $in: [Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER] } }).select("name role").sort({ role: 1, name: 1 }).lean(),
  ]);
  const mgrIds = [...new Set(users.map((u: any) => u.managerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  res.json({
    total, page, per: PER,
    seniors: seniors.map((s: any) => ({ id: String(s._id), name: s.name })),
    managers: managers.map((m: any) => ({ id: String(m._id), name: m.name, role: m.role })),
    users: users.map((u: any) => ({
      id: String(u._id), name: u.name, email: u.email, role: u.role, active: u.active,
      mustSetPassword: !!u.mustSetPassword,
      managerId: u.managerId ? String(u.managerId) : "",
      managerName: u.managerId ? mgrName[String(u.managerId)] || null : null,
      lastLoginAt: u.lastLoginAt || null,
      lastSeenAt: u.lastSeenAt || null,
      // "Live" = active session activity within the last 5 minutes (the throttled last-seen window).
      online: !!(u.lastSeenAt && Date.now() - new Date(u.lastSeenAt).getTime() < 5 * 60 * 1000),
    })),
  });
});

// Create a user (password optional → emailed set-password link).
router.post("/", opsOnly, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "");
  const managerId = req.body?.managerId ? String(req.body.managerId) : null;

  if (!name || !email) return res.status(400).json({ error: "Name and email are required" });
  if (password) { const sec = await getSecurity(); const i = passwordIssue(password, { minLength: sec.passwordMinLength, requireComplexity: sec.requireComplexity }); if (i) return res.status(400).json({ error: i }); }
  if (!Object.values(Role).includes(role as any)) return res.status(400).json({ error: "Bad role" });
  if (role === Role.CAPABILITY_MANAGER && !managerId) return res.status(400).json({ error: "Capability Managers must report to a Senior Manager" });
  if (await User.findOne({ email })) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = password ? await hashPassword(password) : bcrypt.hashSync("pending-" + crypto.randomBytes(16).toString("hex"), 10);
  const created = await User.create({ name, email, role, passwordHash, mustSetPassword: !password, managerId: role === Role.CAPABILITY_MANAGER ? managerId : null });
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "USER_CREATE", fieldName: "User", newValue: `${name} (${role})`, reason: "User created" });

  let invite: { link: string; delivered: boolean; email: string } | null = null;
  if (!password) { try { invite = await inviteUser(created, config.appUrl); } catch {} }
  res.json({ ok: true, id: String(created._id), inviteLink: invite?.link || null, emailed: invite?.delivered || false });
});

// Update a user.
router.patch("/:id", opsOnly, async (req, res) => {
  const { name, email, role, managerId, active, newPassword } = req.body || {};
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });
  const isSelf = String(target._id) === req.user!.id;

  if (typeof name === "string" && name.trim()) target.name = name.trim();
  if (typeof email === "string" && email.trim()) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ error: "Enter a valid email address." });
    if (e !== target.email) {
      const taken = await User.findOne({ email: e, _id: { $ne: target._id } }).select("_id").lean();
      if (taken) return res.status(409).json({ error: "That email is already in use by another user." });
      target.email = e;
    }
  }
  if (typeof active === "boolean") { if (isSelf && !active) return res.status(400).json({ error: "You can't deactivate your own account." }); target.active = active; }
  if (role) {
    if (!Object.values(Role).includes(role)) return res.status(400).json({ error: "Bad role" });
    if (isSelf && role !== Role.OPS_ADMIN) return res.status(400).json({ error: "You can't change your own role." });
    target.role = role;
    if (role === Role.CAPABILITY_MANAGER) { const mgr = managerId || (target.managerId ? String(target.managerId) : null); if (!mgr) return res.status(400).json({ error: "Capability Managers must report to a Senior Manager." }); target.managerId = mgr; }
    else target.managerId = null;
  } else if (managerId !== undefined && target.role === Role.CAPABILITY_MANAGER) target.managerId = managerId || null;
  if (newPassword) { const sec = await getSecurity(); const i = passwordIssue(newPassword, { minLength: sec.passwordMinLength, requireComplexity: sec.requireComplexity }); if (i) return res.status(400).json({ error: i }); target.passwordHash = await hashPassword(newPassword); target.mustSetPassword = false; target.resetTokenHash = null; target.resetTokenExp = null; target.passwordChangedAt = new Date(); }

  await target.save();
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "USER_UPDATE", fieldName: "User updated", newValue: `${target.name} (${target.role})`, reason: newPassword ? "Updated (incl. password)" : "Updated" });
  res.json({ ok: true });
});

// Delete a user (with guards).
router.delete("/:id", opsOnly, async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (String(target._id) === req.user!.id) return res.status(400).json({ error: "You can't delete your own account." });
  if (target.role === Role.CAPABILITY_MANAGER) { const n = await Instructor.countDocuments({ currentManagerId: target._id }); if (n > 0) return res.status(409).json({ error: `Reassign this manager's ${n} reportee(s) first (Assignments).` }); }
  if (target.role === Role.SENIOR_MANAGER) {
    // Only ACTIVE-relevant org rule: block on Capability Managers that report to this SM (matches the UI/Org chart).
    const cms = await User.find({ managerId: target._id, role: Role.CAPABILITY_MANAGER }).select("name").sort({ name: 1 }).lean();
    if (cms.length) return res.status(409).json({ error: `Reassign the ${cms.length} Capability Manager(s) reporting to them first: ${cms.slice(0, 5).map((c: any) => c.name).join(", ")}${cms.length > 5 ? "…" : ""}.` });
  }
  if (target.role === Role.OPS_ADMIN) { const n = await User.countDocuments({ role: Role.OPS_ADMIN }); if (n <= 1) return res.status(409).json({ error: "Can't delete the last Ops Admin." }); }
  await User.deleteOne({ _id: target._id });
  // Clear any dangling "reports to" references (e.g. a non-CM account that wrongly pointed here).
  await User.updateMany({ managerId: target._id }, { $set: { managerId: null } });
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "USER_DELETE", fieldName: "User deleted", oldValue: `${target.name} (${target.role})`, reason: "Deleted" });
  res.json({ ok: true });
});

// Single set-password invite.
router.post("/:id/invite", opsOnly, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.email) return res.status(400).json({ error: "User has no email address" });
  const { link, delivered } = await inviteUser(user, config.appUrl);
  res.json({ ok: true, link, delivered, email: user.email });
});

// Bulk set-password invite.
router.post("/invite/bulk", opsOnly, async (req, res) => {
  const scope = req.body?.scope === "all" ? "all" : "pending";
  const filter: any = { active: true, email: { $ne: null }, role: { $ne: Role.OPS_ADMIN } };
  if (scope === "pending") filter.mustSetPassword = true;
  const users = await User.find(filter).select("email name").lean();
  if (!users.length) return res.json({ ok: true, count: 0, delivered: 0 });

  const ops: any[] = []; const toSend: { user: any; link: string }[] = [];
  const exp = new Date(Date.now() + 60 * 60 * 1000);
  for (const u of users) {
    const { token, hash } = makeResetToken();
    ops.push({ updateOne: { filter: { _id: u._id }, update: { $set: { resetTokenHash: hash, resetTokenExp: exp, mustSetPassword: true } } } });
    toSend.push({ user: u, link: buildSetPasswordLink(config.appUrl, token, u.email) });
  }
  await User.bulkWrite(ops);
  let delivered = 0;
  const BATCH = 25;
  for (let i = 0; i < toSend.length; i += BATCH) {
    const r = await Promise.allSettled(toSend.slice(i, i + BATCH).map(({ user, link }) => sendSetPasswordEmail(user, link)));
    delivered += r.filter((x) => x.status === "fulfilled" && (x as any).value?.delivered).length;
  }
  res.json({ ok: true, count: users.length, delivered });
});

export default router;
