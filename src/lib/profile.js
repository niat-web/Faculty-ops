import { connectDB } from "./db.js";
import { Instructor, FieldDefinition, User } from "@/models/index.js";
import { filterVisibleFields } from "./rbac.js";
import { maybeDecrypt } from "./crypto.js";
import { Role } from "./enums.js";
import { TRACK_SKILLS, EXIT_ITEMS, skillKey } from "./catalog.js";

// Assemble an instructor's profile for a viewer: structured header + dynamic
// fields grouped by module, with field-level visibility filtering applied.
export async function getProfileForViewer(viewer, instructorId) {
  await connectDB();
  const inst = await Instructor.findById(instructorId).lean();
  if (!inst) return null;

  const defs = await FieldDefinition.find({
    archivedAt: null,
    $or: [{ scope: "GLOBAL" }, { scope: "INSTANCE", instructorId: inst._id }],
  })
    .sort({ module: 1, createdAt: 1 })
    .lean();

  const visible = filterVisibleFields(viewer, defs);
  const values = inst.values || {};

  const byModule = {};
  for (const d of visible) {
    (byModule[d.module] ||= []).push({
      key: d.key,
      label: d.label,
      type: d.type,
      visibility: d.visibility,
      scope: d.scope,
      options: d.options || [],
      value: maybeDecrypt(values[d.key] ?? d.defaultValue ?? null),
    });
  }

  let managerName = "— unassigned —";
  if (inst.currentManagerId) {
    const m = await User.findById(inst.currentManagerId).select("name").lean();
    managerName = m?.name || managerName;
  }

  // Skills checklist for the instructor's primary track (training = "necessary").
  const track = values.primary_track || null;
  const skillsMap = inst.skills || {};
  const skillList = (TRACK_SKILLS[track] || []).map((label) => {
    const key = skillKey(track, label);
    return { key, label, done: skillsMap[key] === true };
  });
  // Full per-module status imported from the track sheets (richer than the
  // catalog checklist — keeps In Progress / On Hold / Not Started).
  const moduleStatus = Object.entries(inst.moduleStatus || {})
    .map(([name, status]) => ({ name, status }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const skills = { track, list: skillList, done: skillList.filter((s) => s.done).length, moduleStatus };

  // Exit checklist + documents are sensitive → privileged roles only.
  const privileged = viewer.role === Role.OPS_ADMIN || viewer.role === Role.SENIOR_MANAGER;
  const exitItems = EXIT_ITEMS.map((it) => ({ ...it, done: inst.exit?.items?.[it.key] === true }));
  const exit = privileged
    ? {
        lastWorkingDay: inst.exit?.lastWorkingDay || "",
        typeOfExit: inst.exit?.typeOfExit || "",
        reason: inst.exit?.reason || "",
        detailedReason: inst.exit?.detailedReason || "",
        items: exitItems,
      }
    : null;
  const documents = privileged
    ? (inst.documents || []).map((d) => ({
        id: String(d._id), name: d.name, path: d.path,
        uploadedByName: d.uploadedByName, createdAt: d.createdAt,
      })).reverse()
    : null;

  return {
    skills,
    exit,
    documents,
    instructor: {
      id: String(inst._id),
      employeeId: inst.employeeId,
      name: inst.name,
      email: inst.email,
      campus: inst.campus,
      status: inst.status,
      managerName,
      notes: (inst.notes || []).map((nt) => ({
        id: String(nt._id),
        body: nt.body,
        authorName: nt.authorName,
        createdAt: nt.createdAt,
      })).reverse(),
      lifecycle: (inst.lifecycle || []).map((l) => ({
        status: l.status, note: l.note, actorName: l.actorName, createdAt: l.createdAt,
      })).reverse(),
    },
    byModule,
  };
}
