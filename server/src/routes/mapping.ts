import { Router } from "express";
import { Instructor, User } from "../models";
import { Role } from "../enums";
import { canManageMapping } from "../lib/rbac";
import { notify, writeAudit } from "../lib/services";
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

  let changed = 0;
  for (const id of ids) {
    const inst: any = await Instructor.findById(id);
    if (!inst) continue;
    const prev = inst.currentManagerId ? String(inst.currentManagerId) : null;
    if (prev === (managerId || null)) continue;
    // close current assignment, open a new one
    const open = inst.assignments.find((a: any) => !a.endedAt);
    if (open) open.endedAt = new Date();
    inst.currentManagerId = managerId || null;
    if (managerId) inst.assignments.push({ managerId, assignedById: req.user!.id });
    await inst.save();
    changed++;
    await writeAudit({ instructorId: inst._id, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "MAPPING_CHANGE", fieldName: "Capability Manager", oldValue: prev || "—", newValue: managerId || "— unassigned —", reason: "Reassignment" });
  }
  if (managerId) await notify(managerId, { type: "REASSIGNED", title: "Instructors assigned to you", body: `${changed} instructor(s) reassigned by ${req.user!.name}`, link: "/app/instructors" });
  res.json({ ok: true, changed });
});

export default router;
