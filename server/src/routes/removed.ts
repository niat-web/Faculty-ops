import { Router } from "express";
import { RemovedInstructor, Instructor } from "../models";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { writeAudit } from "../lib/services";
import { clearRemovedCache, removedEmployeeIdSet } from "../lib/removed";
import { clean, norm } from "../lib/darwinboxSync";
import { darwinboxFullDirectory } from "../lib/staffRoles";

// Removed (hidden) instructors — an Ops-Admin-only tool. Hiding a person excludes them from EVERY page
// (Master, Exited, Org chart incl. CM counts, Training Stats, Contribution, role counts) WITHOUT deleting
// anything from MongoDB or Darwinbox. Restoring brings them back everywhere. Keyed on Employee ID, so it
// works for instructors and staff (Ops/CM/SM) alike, deduped (one entry per Employee ID).

const router = Router();
router.use(requireUser());
// Global hide affects the whole app → Ops Admin only.
const opsGuard = (req: any, res: any, next: any) => (req.user?.role === Role.OPS_ADMIN ? next() : res.status(403).json({ error: "Only an Ops Admin can hide or restore people." }));

// Resolve a mix of instructorIds and/or employeeIds → {employeeId, name, email, department} to store.
async function resolvePeople(body: any): Promise<{ employeeId: string; name?: string; email?: string; department?: string }[]> {
  const out: { employeeId: string; name?: string; email?: string; department?: string }[] = [];
  const seen = new Set<string>();
  const push = (employeeId: string, name?: string, email?: string, department?: string) => {
    const e = clean(employeeId); const k = norm(e);
    if (!e || seen.has(k)) return; seen.add(k);
    out.push({ employeeId: e, name, email, department });
  };
  // From Mongo instructor ids.
  const instructorIds: string[] = Array.isArray(body?.instructorIds) ? body.instructorIds.map(String).filter(Boolean) : [];
  if (instructorIds.length) {
    const docs = await Instructor.find({ _id: { $in: instructorIds } }).select("employeeId name email values").lean();
    for (const d of docs as any[]) push(d.employeeId, d.name, d.email, d.values?.department);
  }
  // From explicit employeeIds (covers Darwinbox-only people with no Mongo doc).
  const employeeIds: string[] = Array.isArray(body?.employeeIds) ? body.employeeIds.map(String).filter(Boolean) : [];
  if (employeeIds.length) {
    // Enrich with Mongo name/email where available.
    const docs = await Instructor.find({ employeeId: { $in: employeeIds } }).select("employeeId name email values").lean();
    const byEmp = new Map<string, any>((docs as any[]).map((d) => [norm(d.employeeId), d]));
    for (const e of employeeIds) { const d = byEmp.get(norm(e)); push(e, d?.name, d?.email, d?.values?.department); }
  }
  return out;
}

// Hide one or more people (bulk). Body: { instructorIds?: [], employeeIds?: [], reason?: "" }.
router.post("/", opsGuard, async (req, res) => {
  const people = await resolvePeople(req.body);
  if (!people.length) return res.status(400).json({ error: "No valid people to remove." });
  const reason = String(req.body?.reason || "").trim() || null;
  let removed = 0;
  for (const p of people) {
    const r = await RemovedInstructor.updateOne(
      { employeeId: p.employeeId },
      { $setOnInsert: { employeeId: p.employeeId, name: p.name || p.employeeId, email: p.email || "", department: p.department || "", reason, removedById: req.user!.id, removedByName: req.user!.name } },
      { upsert: true }
    );
    if (r.upsertedCount) {
      removed++;
      await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "INSTRUCTOR_REMOVE", fieldName: "Hidden from app", newValue: `${p.name || ""} (${p.employeeId})`, reason: reason || "Removed via Master" });
    }
  }
  clearRemovedCache();
  res.json({ ok: true, removed, requested: people.length });
});

// Restore (un-hide) one or more people. Body: { employeeIds: [] }.
router.post("/restore", opsGuard, async (req, res) => {
  const employeeIds: string[] = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds.map(String).filter(Boolean) : [];
  if (!employeeIds.length) return res.status(400).json({ error: "No people to restore." });
  const docs = await RemovedInstructor.find({ employeeId: { $in: employeeIds } }).lean();
  let restored = 0;
  for (const d of docs as any[]) {
    await RemovedInstructor.deleteOne({ _id: d._id });
    restored++;
    await writeAudit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "INSTRUCTOR_RESTORE", fieldName: "Restored to app", newValue: `${d.name || ""} (${d.employeeId})`, reason: "Restored from Removed list" });
  }
  clearRemovedCache();
  res.json({ ok: true, restored });
});

// List removed people — searchable by name / Employee ID / email. Each entry is enriched from BOTH
// Darwinbox and MongoDB (deduped by Employee ID) so the admin sees the fullest record even for people
// who only exist in one source.
router.get("/", opsGuard, async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const docs = await RemovedInstructor.find({}).sort({ createdAt: -1 }).lean();

  // Darwinbox lookup by Employee ID — from the MongoDB directory mirror (kept fresh by the hourly
  // sync). Best-effort: empty if the mirror hasn't been populated yet.
  let dbByEmp = new Map<string, any>();
  try {
    const dir = await darwinboxFullDirectory();
    for (const p of dir) {
      const e = norm(p.employeeId); if (!e || dbByEmp.has(e)) continue;
      dbByEmp.set(e, { name: clean(p.name), email: clean(p.email), department: clean(p.department) });
    }
  } catch { /* directory optional — fall back to the stored fields */ }

  const list = (docs as any[]).map((d) => {
    const db = dbByEmp.get(norm(d.employeeId));
    return {
      employeeId: d.employeeId,
      name: d.name || db?.name || d.employeeId,
      email: d.email || db?.email || "",
      department: d.department || db?.department || "",
      reason: d.reason || "",
      removedByName: d.removedByName || "",
      removedAt: d.createdAt,
      inDarwinbox: !!db,
    };
  });
  const filtered = q ? list.filter((p) => `${p.name} ${p.employeeId} ${p.email}`.toLowerCase().includes(q)) : list;
  res.json({ removed: filtered, total: list.length });
});

// Count (for a badge / quick check).
router.get("/count", opsGuard, async (_req, res) => {
  const set = await removedEmployeeIdSet();
  res.json({ count: set.size });
});

export default router;
