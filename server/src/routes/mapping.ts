import { Router } from "express";
import { Instructor, User, AuditLog } from "../models";
import { Role } from "../enums";
import { canManageMapping } from "../lib/rbac";
import { notify } from "../lib/services";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());
const guard = (req: any, res: any, next: any) => (canManageMapping(req.user) ? next() : res.status(403).json({ error: "Forbidden" }));

// Data for the Assignments page: CMs (with reportee counts) + ALL instructors.
router.get("/", guard, async (_req, res) => {
  const [cms, sms, counts, instructors] = await Promise.all([
    User.find({ role: Role.CAPABILITY_MANAGER, active: true }).select("name managerId").sort({ name: 1 }).lean(),
    User.find({ role: Role.SENIOR_MANAGER, active: true }).select("name").lean(),
    Instructor.aggregate([{ $group: { _id: "$currentManagerId", n: { $sum: 1 } } }]),
    Instructor.find().select("name employeeId currentManagerId campus").sort({ employeeId: 1 }).lean(),
  ]);
  const smName = Object.fromEntries(sms.map((s: any) => [String(s._id), s.name]));
  const countByCm = Object.fromEntries(counts.map((c: any) => [String(c._id), c.n]));
  res.json({
    cms: cms.map((c: any) => ({ id: String(c._id), name: c.name })),
    managers: cms.map((c: any) => ({ id: String(c._id), name: c.name, reportsTo: c.managerId ? smName[String(c.managerId)] || "—" : "— unassigned —", reportees: countByCm[String(c._id)] || 0 })),
    instructors: instructors.map((i: any) => ({ id: String(i._id), name: i.name, employeeId: i.employeeId, campus: i.campus, managerId: i.currentManagerId ? String(i.currentManagerId) : null })),
  });
});

// Reassign one or many instructors to a Capability Manager (preserves history).
router.post("/reassign", guard, async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.instructorIds) ? req.body.instructorIds : (req.body?.instructorId ? [req.body.instructorId] : []);
  const managerId = req.body?.managerId || null;
  if (!ids.length) return res.status(400).json({ error: "No instructors selected" });
  if (managerId) { const cm = await User.findOne({ _id: managerId, role: Role.CAPABILITY_MANAGER, active: true }).lean(); if (!cm) return res.status(400).json({ error: "Invalid or inactive Capability Manager" }); }

  // Batched: close open assignments, set the new manager + push the new assignment, audit — in a few
  // queries instead of N sequential saves (a CM with hundreds of reportees would otherwise time out). (Improvement)
  const docs = await Instructor.find({ _id: { $in: ids } }).select("currentManagerId name").lean();
  const changedDocs = docs.filter((d: any) => (d.currentManagerId ? String(d.currentManagerId) : null) !== (managerId || null));
  if (changedDocs.length) {
    const now = new Date();
    const changedIds = changedDocs.map((d: any) => d._id);
    // 1) close any open assignment (separate update so it doesn't conflict with the $push below)
    await Instructor.updateMany({ _id: { $in: changedIds } }, { $set: { "assignments.$[o].endedAt": now } }, { arrayFilters: [{ "o.endedAt": null }] });
    // 2) set the new manager and (if assigning) open a new assignment
    await Instructor.updateMany(
      { _id: { $in: changedIds } },
      { $set: { currentManagerId: managerId || null }, ...(managerId ? { $push: { assignments: { managerId, assignedById: req.user!.id, startedAt: now } } } : {}) }
    );
    await AuditLog.insertMany(changedDocs.map((d: any) => ({
      instructorId: d._id, instructorName: d.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: "MAPPING_CHANGE", fieldName: "Capability Manager", oldValue: d.currentManagerId ? String(d.currentManagerId) : "—", newValue: managerId || "— unassigned —", reason: "Reassignment", createdAt: now,
    })));
  }
  const changed = changedDocs.length;
  if (managerId && changed) await notify(managerId, { type: "REASSIGNED", title: "Instructors assigned to you", body: `${changed} instructor(s) reassigned by ${req.user!.name}`, link: "/app/instructors" });
  res.json({ ok: true, changed });
});

export default router;
