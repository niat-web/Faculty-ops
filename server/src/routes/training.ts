import { Router } from "express";
import { Instructor, User, FieldDefinition, TrainingColumn } from "../models";
import { Role } from "../enums";
import { instructorScopeFilter, canAccessInstructor } from "../lib/rbac";
import { tabForInstructor, TRACK_META, seedTrainingColumns, STATUS_OPTIONS } from "../lib/training";
import { maybeDecrypt, encrypt } from "../lib/crypto";
import { writeAudit } from "../lib/services";
import { requireUser } from "../middleware";

const router = Router();
router.use(requireUser());
const STAFF = [Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER];
const staffGuard = (req: any, res: any, next: any) => (STAFF.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const opsGuard = (req: any, res: any, next: any) => (req.user.role === Role.OPS_ADMIN ? next() : res.status(403).json({ error: "Only the Super Admin can manage training columns" }));
const colOut = (c: any) => ({ id: String(c._id), track: c.track, group: c.group || "", label: c.label, key: c.key, storage: c.storage, type: c.type, options: c.options || [], order: c.order });

async function loadColumns() {
  await seedTrainingColumns();
  return TrainingColumn.find({ archivedAt: null }).sort({ track: 1, order: 1 }).lean();
}
// Live track → module-key sets, so classification follows the admin-editable columns.
function liveTrackKeys(cols: any[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of cols) if (c.storage === "module") (out[c.track] ||= []).push(c.key);
  return out;
}
// Both STATUS and DROPDOWN validate against the column's own (DB-stored) option set.
const optsFor = (type: string, options: string[]) => (type === "STATUS" && !options?.length ? STATUS_OPTIONS : options || []);
function validateCell(type: string, options: string[], value: string): string | null {
  if (value === "") return null;
  if (type === "NUMBER") return isNaN(Number(value)) ? "Must be a number." : null;
  if (type === "DATE") return isNaN(Date.parse(value)) ? "Must be a valid date." : null;
  if (type === "DROPDOWN" || type === "STATUS") return optsFor(type, options).includes(value) ? null : "Value is not an allowed option.";
  return null;
}
// Options are stored for STATUS + DROPDOWN; other types carry none.
function cleanOptions(type: string, options: any): string[] {
  if (type !== "STATUS" && type !== "DROPDOWN") return [];
  const arr = Array.isArray(options) ? options.map((o: any) => String(o).trim()).filter(Boolean) : [];
  if (type === "STATUS" && !arr.length) return [...STATUS_OPTIONS];
  return arr;
}

// Grid data — scoped: Ops/SM see all, a Capability Manager sees only their reportees.
router.get("/", staffGuard, async (req, res) => {
  const cols = await loadColumns();
  const live = liveTrackKeys(cols as any[]);
  const sensitiveKeys = new Set((await FieldDefinition.find({ visibility: "SENSITIVE", archivedAt: null }).select("key").lean()).map((f: any) => f.key));
  const valueKeys = [...new Set((cols as any[]).filter((c) => c.storage === "value").map((c) => c.key))];

  const docs = await Instructor.find(instructorScopeFilter(req.user!)).select("employeeId name currentManagerId values moduleStatus").lean();
  const mgrIds = [...new Set(docs.map((d: any) => d.currentManagerId).filter(Boolean).map(String))];
  const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
  const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));

  const rows: any[] = [];
  const trackCount: Record<string, number> = {};
  for (const d of docs as any[]) {
    const values = d.values || {};
    const moduleStatus = d.moduleStatus || {};
    const tab = tabForInstructor(values, moduleStatus, live);
    if (!tab) continue;
    trackCount[tab] = (trackCount[tab] || 0) + 1;
    const vals: Record<string, string> = {};
    for (const k of valueKeys) vals[k] = (sensitiveKeys.has(k) ? maybeDecrypt(values[k]) : values[k]) ?? "";
    rows.push({ id: String(d._id), tab, employeeId: d.employeeId, name: d.name, manager: d.currentManagerId ? (mgrName[String(d.currentManagerId)] || "—") : "—", values: vals, moduleStatus });
  }
  rows.sort((a, b) => (a.employeeId || "").localeCompare(b.employeeId || ""));

  const columns: Record<string, any[]> = {};
  for (const c of cols as any[]) (columns[c.track] ||= []).push(colOut(c));
  const tracks = TRACK_META.map((t) => ({ ...t, count: trackCount[t.key] || 0, columns: (columns[t.key] || []).length }));
  res.json({ rows, columns, tracks, role: req.user!.role, canDelete: req.user!.role === Role.OPS_ADMIN });
});

// Track list (for the Dynamic Fields → Training Stats section).
router.get("/tracks", staffGuard, async (_req, res) => {
  const cols = await loadColumns();
  const byTrack: Record<string, number> = {};
  for (const c of cols as any[]) byTrack[c.track] = (byTrack[c.track] || 0) + 1;
  res.json({ tracks: TRACK_META.map((t) => ({ ...t, columns: byTrack[t.key] || 0 })) });
});

// Count how many instructors have a value under each column key (for "in use" / delete impact).
async function usageByKey(): Promise<Record<string, number>> {
  const agg = await Instructor.aggregate([
    { $project: { keys: { $setUnion: [
      { $map: { input: { $objectToArray: { $ifNull: ["$moduleStatus", {}] } }, in: "$$this.k" } },
      { $map: { input: { $objectToArray: { $ifNull: ["$values", {}] } }, in: "$$this.k" } },
    ] } } },
    { $unwind: "$keys" }, { $group: { _id: "$keys", n: { $sum: 1 } } },
  ]);
  return Object.fromEntries(agg.map((a: any) => [a._id, a.n]));
}

// Columns for one track (ordered) with usage counts.
router.get("/columns", staffGuard, async (req, res) => {
  const track = String(req.query.track || "");
  if (!TRACK_META.some((t) => t.key === track)) return res.status(400).json({ error: "Unknown track" });
  await seedTrainingColumns();
  const [cols, archived, usage] = await Promise.all([
    TrainingColumn.find({ track, archivedAt: null }).sort({ order: 1 }).lean(),
    TrainingColumn.find({ track, archivedAt: { $ne: null } }).sort({ label: 1 }).lean(),
    usageByKey(),
  ]);
  const meta = TRACK_META.find((t) => t.key === track);
  res.json({
    track, label: meta?.label,
    columns: (cols as any[]).map((c) => ({ ...colOut(c), inUse: usage[c.key] || 0 })),
    archived: (archived as any[]).map((c) => ({ ...colOut(c), inUse: usage[c.key] || 0 })),
  });
});

// Restore an archived column (Ops).
router.post("/columns/:id/restore", opsGuard, async (req, res) => {
  const col: any = await TrainingColumn.findById(req.params.id);
  if (!col) return res.status(404).json({ error: "Not found" });
  if (await TrainingColumn.findOne({ track: col.track, key: col.key, archivedAt: null, _id: { $ne: col._id } })) return res.status(409).json({ error: "An active column with that name already exists." });
  col.archivedAt = null;
  await col.save();
  res.json({ ok: true });
});

// Create a column (Ops).
router.post("/columns", opsGuard, async (req, res) => {
  const { track, label, group = "", type = "STATUS", options = [], storage } = req.body || {};
  if (!TRACK_META.some((t) => t.key === track)) return res.status(400).json({ error: "Unknown track" });
  if (!String(label || "").trim()) return res.status(400).json({ error: "Label is required" });
  if (!["STATUS", "DROPDOWN", "TEXT", "NUMBER", "DATE"].includes(type)) return res.status(400).json({ error: "Bad type" });
  const store = storage === "module" || storage === "value" ? storage : (type === "STATUS" ? "module" : "value");
  const key = String(req.body?.key || "").trim() || (store === "module" ? String(label).trim() : String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""));
  if (/[.$]/.test(key)) return res.status(400).json({ error: "The label can't contain '.' or '$'." });
  if (await TrainingColumn.findOne({ track, key, archivedAt: null })) return res.status(409).json({ error: "A column with that name already exists in this track." });
  const last = await TrainingColumn.findOne({ track }).sort({ order: -1 }).select("order").lean();
  try {
    const col = await TrainingColumn.create({
      track, group: String(group || "").trim(), label: String(label).trim(), key, storage: store, type,
      options: cleanOptions(type, options),
      order: ((last as any)?.order ?? -1) + 1,
    });
    res.json({ ok: true, column: colOut(col) });
  } catch (e: any) {
    if (e.code === 11000) return res.status(409).json({ error: "A column with that name already exists in this track." });
    throw e;
  }
});

// Edit a column (Ops). Storage is immutable; type only changes the editor/validation.
router.patch("/columns/:id", opsGuard, async (req, res) => {
  const col: any = await TrainingColumn.findById(req.params.id);
  if (!col) return res.status(404).json({ error: "Not found" });
  const { label, group, type, options } = req.body || {};
  if (typeof label === "string" && label.trim()) col.label = label.trim();
  if (typeof group === "string") col.group = group.trim();
  if (type && ["STATUS", "DROPDOWN", "TEXT", "NUMBER", "DATE"].includes(type)) col.type = type;
  if (options !== undefined || type) col.options = cleanOptions(col.type, options !== undefined ? options : col.options);
  await col.save();
  res.json({ ok: true, column: colOut(col) });
});

// Archive a column (Ops) — soft delete; instructor data is preserved and can be restored.
router.delete("/columns/:id", opsGuard, async (req, res) => {
  await TrainingColumn.updateOne({ _id: req.params.id }, { $set: { archivedAt: new Date() } });
  res.json({ ok: true });
});

// Reorder columns within a track (Ops). body: { track, orderedIds: [] } — must be the full active set.
router.post("/columns/reorder", opsGuard, async (req, res) => {
  const { track, orderedIds } = req.body || {};
  if (!TRACK_META.some((t) => t.key === track) || !Array.isArray(orderedIds)) return res.status(400).json({ error: "Bad request" });
  const ids = new Set((await TrainingColumn.find({ track, archivedAt: null }).select("_id").lean()).map((c: any) => String(c._id)));
  if (orderedIds.length !== ids.size || !orderedIds.every((id: string) => ids.has(String(id)))) return res.status(409).json({ error: "Column set is stale — reload and try again." });
  await TrainingColumn.bulkWrite(orderedIds.map((id: string, i: number) => ({ updateOne: { filter: { _id: id, track }, update: { $set: { order: i } } } })));
  res.json({ ok: true });
});

// Update a single grid cell. body: { instructorId, track, target: "module"|"value", key, value }
router.post("/", staffGuard, async (req, res) => {
  const { instructorId, track, target, key, value } = req.body || {};
  if (!instructorId || !target || !key) return res.status(400).json({ error: "Missing fields" });
  if (!["module", "value"].includes(target)) return res.status(400).json({ error: "Bad target" });
  if (!(await canAccessInstructor(req.user!, instructorId))) return res.status(403).json({ error: "Out of scope" });

  // The key MUST be a real training column (prevents writing arbitrary/sensitive keys here).
  const col: any = await TrainingColumn.findOne({ key, storage: target, archivedAt: null, ...(track ? { track } : {}) }).lean();
  if (!col) return res.status(400).json({ error: "Unknown training column" });
  const clean = String(value ?? "").trim();
  const verr = validateCell(col.type, col.options || [], clean);
  if (verr) return res.status(400).json({ error: verr });

  const inst: any = await Instructor.findById(instructorId);
  if (!inst) return res.status(404).json({ error: "Not found" });

  if (target === "module") {
    if (clean) inst.moduleStatus.set(key, clean); else inst.moduleStatus.delete(key);
    await inst.save();
    await writeAudit({ instructorId, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_EDIT", fieldName: col.label, newValue: clean || "(cleared)", reason: "Training stats update" });
    return res.json({ ok: true });
  }
  // value: encrypt only if a matching field happens to be SENSITIVE.
  const def: any = await FieldDefinition.findOne({ key, archivedAt: null }).select("visibility label").lean();
  const sensitive = def?.visibility === "SENSITIVE";
  if (clean) inst.values.set(key, sensitive ? encrypt(clean) : clean); else inst.values.delete(key);
  await inst.save();
  await writeAudit({ instructorId, instructorName: inst.name, actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "FIELD_EDIT", fieldName: def?.label || col.label, newValue: sensitive ? "••••" : (clean || "(cleared)"), reason: "Training stats update" });
  res.json({ ok: true });
});

export default router;
