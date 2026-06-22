import { Instructor, FieldDefinition, User, TrainingColumn, EditRequest } from "../models";
import { filterVisibleFields, type SessionUser } from "./rbac";
import { maybeDecrypt, isEncrypted } from "./crypto";
import { tabForInstructor } from "./training";
import { computeSummary, summaryStored, COMPUTED_KEYS } from "./trainingScore";
import { listModules } from "./modules";
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
  let trainingTab: string | null = null;
  try {
    const moduleCols = await TrainingColumn.find({ archivedAt: null, storage: "module" }).select("track key").lean();
    const live: Record<string, string[]> = {};
    for (const c of moduleCols as any[]) (live[c.track] ||= []).push(c.key);
    const ms = inst.moduleStatus || {};
    trainingTab = tabForInstructor(values, ms, live);
    if (trainingTab) liveSummary = summaryStored(computeSummary(values, ms, trainingTab));
  } catch { /* fall back to stored values */ }

  // Overlay the Training-Stats column definitions (proper DROPDOWN/DATE/NUMBER types + per-track
  // dropdown options) onto matching dynamic fields, so the profile edit modal mirrors the training
  // grid instead of falling back to a plain text box. Keyed by the instructor's resolved track tab.
  const trainingMeta: Record<string, { type: string; options: string[] }> = {};
  if (trainingTab) {
    try {
      const cols = await TrainingColumn.find({ archivedAt: null, track: trainingTab, storage: "value" }).select("key type options").lean();
      for (const c of cols as any[]) trainingMeta[c.key] = { type: c.type, options: c.options || [] };
    } catch { /* fall back to the FieldDefinition's own type */ }
  }

  const byModule: Record<string, any[]> = {};
  for (const d of visible as any[]) {
    const computed = COMPUTED.has(d.key); // live-derived (%, Health) → read-only on the profile
    const value = computed ? (liveSummary[d.key] ?? "") : forDisplay(values[d.key] ?? d.defaultValue ?? null);
    const tm = trainingMeta[d.key];
    const type = tm ? tm.type : d.type;
    const options = tm ? tm.options : (d.options || []);
    (byModule[d.module] ||= []).push({ key: d.key, label: d.label, type, visibility: d.visibility, scope: d.scope, options, min: d.min ?? null, max: d.max ?? null, pattern: d.pattern || null, selfEditable: d.selfEditable !== false, computed, value });
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

  // Fields with an OPEN change request (CM → SM) → surfaced as "Pending" on the profile.
  const pend = await EditRequest.find({ instructorId: inst._id, status: "PENDING" }).select("fieldKey fieldLabel newValue requesterName requesterId createdAt").sort({ createdAt: -1 }).lean();
  const pendingRequests = (pend as any[]).map((r) => ({ id: String(r._id), fieldKey: r.fieldKey, fieldLabel: r.fieldLabel, newValue: r.newValue, requesterName: r.requesterName, requesterId: r.requesterId ? String(r.requesterId) : "", createdAt: r.createdAt }));

  // Staff (Ops Admin / Senior Manager / Capability Manager / central team) are NOT teaching
  // instructors — they only exist as Instructor records so they show in Master. A record is
  // "staff" if it's in the Delivery-Support department OR its email maps to an Ops/SM/CM user.
  // Staff get no teaching sections: hide Training Stats (+ Skills) and Mails.
  const STAFF_DEPT = "Instructors - Delivery Support (Ops and Central managers)";
  let isStaff = values.department === STAFF_DEPT;
  if (!isStaff && inst.email) {
    const u: any = await User.findOne({ email: inst.email }).select("role").lean();
    if (u && [Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER].includes(u.role)) isStaff = true;
  }
  let modules = await listModules(); // section order + labels (incl. admin-created ones)
  let outSkills = skills;
  if (isStaff) {
    delete byModule["TRAINING"];
    modules = (modules as any[]).filter((m) => m.key !== "TRAINING");
    outSkills = { track: null, list: [], done: 0, moduleStatus: [] };
  }

  return {
    isStaff,
    skills: outSkills, exit, documents, pendingRequests,
    modules, // section order + labels (incl. admin-created ones)
    instructor: {
      id: String(inst._id), employeeId: inst.employeeId, name: inst.name, email: inst.email, campus: inst.campus, status: inst.status, managerName,
      notes: (inst.notes || []).map((n: any) => ({ id: String(n._id), body: n.body, authorName: n.authorName, createdAt: n.createdAt })).reverse(),
      lifecycle: (inst.lifecycle || []).map((l: any) => ({ status: l.status, note: l.note, actorName: l.actorName, createdAt: l.createdAt })).reverse(),
    },
    byModule,
  };
}
