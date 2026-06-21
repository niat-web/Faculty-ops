import { Instructor, FieldDefinition, User, TrainingColumn } from "../models";
import { filterVisibleFields, type SessionUser } from "./rbac";
import { maybeDecrypt, isEncrypted } from "./crypto";
import { tabForInstructor } from "./training";
import { computeSummary, summaryStored, COMPUTED_KEYS } from "./trainingScore";
import { Role } from "../enums";

const COMPUTED = new Set<string>(COMPUTED_KEYS as readonly string[]);
// Decrypt for display; a present-but-undecryptable value shows a sentinel rather than a fake blank. (Bug B5)
const forDisplay = (raw: any) => { if (raw == null) return null; const v = maybeDecrypt(raw); return isEncrypted(raw) && v === null ? "[unable to decrypt]" : v; };

const TRACK_SKILLS: Record<string, string[]> = {
  "Frontend Development": ["Static Web", "Responsive Design", "Modern Responsive UI", "JavaScript Sprint", "JavaScript Essentials", "React JS", "Frontend Projects"],
  "Backend Development": ["Python Essentials", "Databases & SQL", "REST APIs", "Authentication", "Node / Express", "Backend Projects"],
  "DSA": ["Time Complexity", "Arrays & Strings", "Linked Lists", "Trees & Graphs", "Dynamic Programming", "Problem-Solving Sprint"],
  "Gen AI": ["Python for AI", "Prompt Engineering", "LLM Fundamentals", "RAG & Embeddings", "Building AI Apps", "Gen AI Capstone"],
  "DSML": ["Statistics", "Python for Data", "Data Wrangling", "ML Algorithms", "Model Evaluation", "DSML Capstone"],
};
const EXIT_ITEMS = [
  { key: "learning_portal_removal", label: "Learning Portal Removal" },
  { key: "teams_whatsapp_removal", label: "Teams / WhatsApp Removal" },
  { key: "id_card_submission", label: "ID Card Submission" },
  { key: "darwin_removal", label: "Darwin Removal" },
  { key: "teach_os_removal", label: "Teach OS Removal" },
  { key: "hr_ops_update", label: "HR Ops Update" },
];
const skillKey = (track: string, skill: string) => `${track}::${skill}`.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export async function getProfileForViewer(viewer: SessionUser, instructorId: string) {
  const inst: any = await Instructor.findById(instructorId).lean();
  if (!inst) return null;

  const defs = await FieldDefinition.find({ archivedAt: null, $or: [{ scope: "GLOBAL" }, { scope: "INSTANCE", instructorId: inst._id }] }).sort({ module: 1, createdAt: 1 }).lean();
  const visible = filterVisibleFields(viewer, defs as any[]);
  const values = inst.values || {};

  // Compute the training summary LIVE so Health/%/Predicted never go stale on the profile. (Bug B1)
  let liveSummary: Record<string, string> = {};
  try {
    const moduleCols = await TrainingColumn.find({ archivedAt: null, storage: "module" }).select("track key").lean();
    const live: Record<string, string[]> = {};
    for (const c of moduleCols as any[]) (live[c.track] ||= []).push(c.key);
    const ms = inst.moduleStatus || {};
    const tab = tabForInstructor(values, ms, live);
    if (tab) liveSummary = summaryStored(computeSummary(values, ms, tab));
  } catch { /* fall back to stored values */ }

  const byModule: Record<string, any[]> = {};
  for (const d of visible as any[]) {
    const value = COMPUTED.has(d.key) ? (liveSummary[d.key] ?? "") : forDisplay(values[d.key] ?? d.defaultValue ?? null);
    (byModule[d.module] ||= []).push({ key: d.key, label: d.label, type: d.type, visibility: d.visibility, scope: d.scope, options: d.options || [], min: d.min ?? null, max: d.max ?? null, pattern: d.pattern || null, selfEditable: d.selfEditable !== false, value });
  }

  let managerName = "— unassigned —";
  if (inst.currentManagerId) { const m: any = await User.findById(inst.currentManagerId).select("name").lean(); managerName = m?.name || managerName; }

  const track = values.primary_track || null;
  const skillsMap = inst.skills || {};
  const skillList = (TRACK_SKILLS[track] || []).map((label) => ({ key: skillKey(track, label), label, done: skillsMap[skillKey(track, label)] === true }));
  const moduleStatus = Object.entries(inst.moduleStatus || {}).map(([name, status]) => ({ name, status })).sort((a, b) => a.name.localeCompare(b.name));
  const skills = { track, list: skillList, done: skillList.filter((s) => s.done).length, moduleStatus };

  const privileged = viewer.role === Role.OPS_ADMIN || viewer.role === Role.SENIOR_MANAGER;
  const exitItems = EXIT_ITEMS.map((it) => ({ ...it, done: inst.exit?.items?.[it.key] === true }));
  const exit = privileged ? { lastWorkingDay: inst.exit?.lastWorkingDay || "", typeOfExit: inst.exit?.typeOfExit || "", reason: inst.exit?.reason || "", detailedReason: inst.exit?.detailedReason || "", items: exitItems } : null;
  const documents = privileged ? (inst.documents || []).map((d: any) => ({ id: String(d._id), name: d.name, path: d.path, uploadedByName: d.uploadedByName, createdAt: d.createdAt })).reverse() : null;

  return {
    skills, exit, documents,
    instructor: {
      id: String(inst._id), employeeId: inst.employeeId, name: inst.name, email: inst.email, campus: inst.campus, status: inst.status, managerName,
      notes: (inst.notes || []).map((n: any) => ({ id: String(n._id), body: n.body, authorName: n.authorName, createdAt: n.createdAt })).reverse(),
      lifecycle: (inst.lifecycle || []).map((l: any) => ({ status: l.status, note: l.note, actorName: l.actorName, createdAt: l.createdAt })).reverse(),
    },
    byModule,
  };
}
