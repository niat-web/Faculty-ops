import { Router } from "express";
import { Instructor, FieldDefinition, User } from "../models";
import { Role } from "../enums";
import { instructorScopeFilter } from "../lib/rbac";
import { writeAudit } from "../lib/services";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());
const STAFF = [Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER];
const staffGuard = (req: any, res: any, next: any) => (STAFF.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));

// The dynamic "Contribution" field (resolved by label; key is a safe slug like "contribution").
async function contribField(): Promise<{ key: string; label: string } | null> {
  const f: any = await FieldDefinition.findOne({ label: { $regex: /^contribution$/i }, archivedAt: null }).select("key label").lean();
  return f ? { key: f.key, label: f.label } : null;
}

// Distinct contribution values + instructor counts, scoped to the viewer.
router.get("/", staffGuard, async (req, res) => {
  const field = await contribField();
  if (!field) return res.json({ field: null, items: [], total: 0 });
  const path = `values.${field.key}`;
  const agg = await Instructor.aggregate([
    { $match: instructorScopeFilter(req.user!) },
    { $group: { _id: `$${path}`, n: { $sum: 1 } } },
  ]);
  const items = agg
    .filter((a: any) => a._id != null && String(a._id).trim() !== "")
    .map((a: any) => ({ value: String(a._id), count: a.n }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  res.json({ field, items, total: items.reduce((s, i) => s + i.count, 0) });
});

// Campus-wise instructor counts, split by payroll entity (University vs Nxtwave). Excludes exited.
const EXIT_STATES = ["EXITED", "EXIT_IN_PROGRESS"];
router.get("/campuswise", staffGuard, async (req, res) => {
  const agg = await Instructor.aggregate([
    { $match: { ...instructorScopeFilter(req.user!), status: { $nin: EXIT_STATES } } },
    { $group: {
      _id: "$campus", total: { $sum: 1 },
      university: { $sum: { $cond: [{ $eq: ["$values.payroll_entity", "University"] }, 1, 0] } },
      nxtwave: { $sum: { $cond: [{ $eq: ["$values.payroll_entity", "Nxtwave"] }, 1, 0] } },
    } },
  ]);
  const items = agg
    .filter((a: any) => a._id != null && String(a._id).trim() !== "")
    .map((a: any) => ({ campus: String(a._id), total: a.total, university: a.university, nxtwave: a.nxtwave }))
    .sort((a, b) => b.total - a.total || a.campus.localeCompare(b.campus));
  const totals = items.reduce((t, i) => ({ total: t.total + i.total, university: t.university + i.university, nxtwave: t.nxtwave + i.nxtwave }), { total: 0, university: 0, nxtwave: 0 });
  res.json({ items, totals });
});

// Capability Manager distribution — reportee counts per manager (+ unassigned), with grand total.
router.get("/managers", staffGuard, async (req, res) => {
  const agg = await Instructor.aggregate([
    { $match: instructorScopeFilter(req.user!) },
    { $group: { _id: "$currentManagerId", n: { $sum: 1 } } },
  ]);
  const mgrIds = agg.map((a: any) => a._id).filter(Boolean).map(String);
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));
  const items = agg
    .map((a: any) => ({ managerId: a._id ? String(a._id) : null, manager: a._id ? (mgrName[String(a._id)] || "—") : "NA (unassigned)", count: a.n }))
    .sort((a, b) => b.count - a.count || a.manager.localeCompare(b.manager));
  res.json({ items, grandTotal: items.reduce((s, i) => s + i.count, 0) });
});

// Rename a contribution value across the viewer's scope (bulk).
router.patch("/", staffGuard, async (req, res) => {
  const field = await contribField();
  if (!field) return res.status(404).json({ error: "No Contribution field is defined." });
  const oldValue = String(req.body?.oldValue ?? "");
  const newValue = String(req.body?.newValue ?? "").trim();
  if (!oldValue) return res.status(400).json({ error: "Missing value to rename." });
  if (!newValue) return res.status(400).json({ error: "Enter a new value." });
  const path = `values.${field.key}`;
  const r = await Instructor.updateMany({ ...instructorScopeFilter(req.user!), [path]: oldValue }, { $set: { [path]: newValue } });
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_EDIT", fieldName: field.label, oldValue, newValue, reason: `Contribution renamed across ${r.modifiedCount} instructor(s)` });
  res.json({ ok: true, changed: r.modifiedCount });
});

// Clear a contribution value from every instructor in the viewer's scope (bulk).
router.post("/delete", staffGuard, async (req, res) => {
  const field = await contribField();
  if (!field) return res.status(404).json({ error: "No Contribution field is defined." });
  const value = String(req.body?.value ?? "");
  if (!value) return res.status(400).json({ error: "Missing value to delete." });
  const path = `values.${field.key}`;
  const r = await Instructor.updateMany({ ...instructorScopeFilter(req.user!), [path]: value }, { $unset: { [path]: "" } });
  await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_EDIT", fieldName: field.label, oldValue: value, reason: `Contribution cleared from ${r.modifiedCount} instructor(s)` });
  res.json({ ok: true, changed: r.modifiedCount });
});

export default router;
