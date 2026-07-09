import { Router } from "express";
import { Instructor, FieldDefinition } from "../models";
import { Role } from "../enums";
import { instructorScopeFilter } from "../lib/rbac";
import { writeAudit } from "../lib/services";
import { requireUser } from "../middleware";
import { loadLiveMasterRows, isDefaultUnchecked } from "../lib/masterLive";
import { clean } from "../lib/darwinboxSync";

const router = Router();
router.use(requireUser());
const STAFF = [Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER];
const staffGuard = (req: any, res: any, next: any) => (STAFF.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const EXIT_STATES = ["EXITED", "EXIT_IN_PROGRESS"]; // exited instructors are excluded from all contribution rollups

// The EXACT active Instructor-Master population: the SAME live Darwinbox rows the Master grid shows on
// its "Active" tab (instructor departments, default support-depts excluded, not exited). Reading from
// this shared source guarantees every contribution rollup's count matches the Master exactly.
async function activeMasterRows(): Promise<{ ok: boolean; error?: string; rows: any[] }> {
  const live = await loadLiveMasterRows();
  if (!live.ok) return { ok: false, error: live.error, rows: [] };
  return { ok: true, rows: live.rows.filter((r) => !r.exited && !isDefaultUnchecked(r.department)) };
}

// The dynamic "Contribution" field (resolved by label; key is a safe slug like "contribution").
async function contribField(): Promise<{ key: string; label: string } | null> {
  const f: any = await FieldDefinition.findOne({ label: { $regex: /^contribution$/i }, archivedAt: null }).select("key label").lean();
  return f ? { key: f.key, label: f.label } : null;
}

// Distinct contribution values + instructor counts over the exact active Master population.
// Blanks are shown too (their own row), so every active instructor is accounted for.
router.get("/", staffGuard, async (req, res) => {
  const field = await contribField();
  const src = await activeMasterRows();
  if (!src.ok) return res.status(502).json({ field, items: [], total: 0, error: src.error });
  const key = field?.key || "contribution";
  const map = new Map<string, number>();
  for (const r of src.rows) { const bucket = clean(r[key]) || "(blank)"; map.set(bucket, (map.get(bucket) || 0) + 1); }
  const items = [...map.entries()]
    .map(([v, count]) => ({ value: v === "(blank)" ? "" : v, blank: v === "(blank)", count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  res.json({ field: field || { key: "contribution", label: "Contribution" }, items, total: src.rows.length });
});

// Campus-wise instructor counts over the active Master population, split by payroll (University vs Nxtwave).
router.get("/campuswise", staffGuard, async (req, res) => {
  const src = await activeMasterRows();
  if (!src.ok) return res.status(502).json({ items: [], totals: { total: 0, university: 0, nxtwave: 0 }, error: src.error });
  const m = new Map<string, { total: number; university: number; nxtwave: number }>();
  for (const r of src.rows) {
    const campus = clean(r.campus) || "(blank)";
    const e = m.get(campus) || { total: 0, university: 0, nxtwave: 0 };
    e.total++;
    const pe = clean(r.payroll_entity).toLowerCase();
    if (pe === "university") e.university++;
    else if (pe === "nxtwave") e.nxtwave++;
    m.set(campus, e);
  }
  const items = [...m.entries()]
    .map(([campus, v]) => ({ campus: campus === "(blank)" ? "" : campus, blank: campus === "(blank)", ...v }))
    .sort((a, b) => b.total - a.total || String(a.campus).localeCompare(String(b.campus)));
  const totals = items.reduce((t, i) => ({ total: t.total + i.total, university: t.university + i.university, nxtwave: t.nxtwave + i.nxtwave }), { total: 0, university: 0, nxtwave: 0 });
  res.json({ items, totals });
});

// Capability Manager distribution — grouped by the DARWINBOX reporting manager (values.reporting_manager,
// e.g. "Name (NWxxxx)"), so it lists every unique reporting manager in Darwinbox with their reportee count,
// over the same instructor population the Master shows. Not the app's currentManagerId.
router.get("/managers", staffGuard, async (req, res) => {
  const src = await activeMasterRows();
  if (!src.ok) return res.status(502).json({ items: [], grandTotal: 0, error: src.error });
  const m = new Map<string, number>();
  for (const r of src.rows) { const raw = clean(r.reporting_manager); m.set(raw, (m.get(raw) || 0) + 1); }
  // A removed CM must not appear even if they still manage (non-removed) reportees.
  const { removedEmployeeIdSet } = await import("../lib/removed");
  const { norm } = await import("../lib/darwinboxSync");
  const removedSet = await removedEmployeeIdSet();
  const items = [...m.entries()]
    .map(([raw, count]) => {
      const id = (raw.match(/\((NW[^)]+)\)/i) || [])[1] || "";     // employee-id code inside the parens
      const name = raw.replace(/\s*\(NW[^)]*\)\s*$/i, "").trim();   // display name without the code
      return { managerId: id || null, manager: name || (raw || "NA (no reporting manager)"), count };
    })
    .filter((it) => !(it.managerId && removedSet.has(norm(it.managerId)))) // drop removed managers
    .sort((a, b) => b.count - a.count || a.manager.localeCompare(b.manager));
  res.json({ items, grandTotal: src.rows.length });
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
