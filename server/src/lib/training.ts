// Training-stats taxonomy: which module columns belong to each track tab,
// and how to classify an instructor into a tab. Ported 1:1 from the Next app.

const TABS = [
  {
    key: "tech",
    label: "Tech",
    groups: [
      { name: "Frontend Development", modules: ["Static Web", "Responsive Design", "Modern Responsive UI", "JavaScript Sprint", "JavaScript Essentials", "React JS", "Frontend Projects"] },
      { name: "Backend Development", modules: ["Python", "SQL", "Node JS", "MongoDB", "Developer Foundation", "Backend Projects"] },
      { name: "DSA", modules: ["DSA", "DIA", "IPS"] },
      { name: "Gen AI", modules: ["Gen AI", "LLM", "AI for Finance"] },
      { name: "DSML", modules: ["ML", "Supervised Learning", "Deep Learning", "ML Projects", "NLP", "Data Foundation"] },
    ],
  },
  {
    key: "math_aptitude",
    label: "Mathematical & Aptitude",
    groups: [
      { name: "Mathematics & Aptitude", modules: ["Quanitative Aptitude", "Numerical Ability", "Logical Reasoning", "Advanced Aptitude", "Mathematics for Computer science", "Probability and Statistics", "Linear Algebra and Calculus"] },
    ],
  },
  {
    key: "english",
    label: "English",
    groups: [
      { name: "English", modules: ["Communicative English Foundation", "Communicative English Advanced", "Communicative English Applied", "Language Analytics"] },
    ],
  },
];

export const TRAINING_TABS = TABS.map((t) => ({ ...t, modules: t.groups.flatMap((g) => g.modules) }));

// Decide which tab an instructor belongs to (or null = not a training row).
// `liveTrackKeys` (track → module-column keys) lets classification follow the
// admin-editable columns instead of the frozen taxonomy; falls back to TRAINING_TABS.
export function tabForInstructor(values: any = {}, moduleStatus: any = {}, liveTrackKeys?: Record<string, string[]>): string | null {
  const track = String(values.primary_track || "").trim().toLowerCase();
  const dept = String(values.department || "").trim().toLowerCase();

  if (track === "english" || dept.includes("english")) return "english";
  if (["mathematics", "maths", "math", "aptitude"].includes(track) || dept.includes("mathematic") || dept.includes("aptitude") || dept.includes("logical reasoning")) return "math_aptitude";
  if (["frontend", "backend", "dsa", "gen ai", "genai", "dsml"].includes(track) || dept.includes("frontend") || dept.includes("backend") || dept.includes("data structures") || dept.includes("gen ai") || dept.includes("interdisciplinary")) return "tech";

  const keys = Object.keys(moduleStatus || {});
  if (keys.length) {
    const sets = liveTrackKeys
      ? Object.entries(liveTrackKeys).map(([key, mods]) => ({ key, modules: mods }))
      : TRAINING_TABS.map((t) => ({ key: t.key, modules: t.modules }));
    let best: string | null = null, bestScore = 0;
    for (const t of sets) { const sc = t.modules.filter((m) => keys.includes(m)).length; if (sc > bestScore) { bestScore = sc; best = t.key; } }
    if (best) return best;
  }
  return null;
}

export const STATUS_OPTIONS = ["Completed", "In Progress", "On Hold", "Not Started"];

export const TRACK_META = [
  { key: "tech", label: "Tech" },
  { key: "math_aptitude", label: "Mathematical & Aptitude" },
  { key: "english", label: "English" },
];

// Department is a fixed picklist (editable by Ops via the Training Columns page later).
export const DEPARTMENT_OPTS = [
  "Instructors - Artificial Intelligence & Emerging Technologies",
  "Instructors - Backend Systems",
  "Instructors - Data Structures & Algorithms",
  "Instructors - Delivery Support (Ops and Central managers)",
  "Instructors - English & Communication Studies",
  "Instructors - Frontend Technologies",
  "Instructors - Gen AI",
  "Instructors - Interdisciplinary & Applied Sciences",
  "Instructors - Mathematical Sciences",
  "Instructors - Quantitative Aptitude & Logical Reasoning",
  "NA",
  "Instructors - AIML",
];

// Context value-columns shown BEFORE the module columns (stored in Instructor.values).
const CONTEXT_SEED: { label: string; key: string; type: string; options?: string[] }[] = [
  { label: "Department", key: "department", type: "DROPDOWN", options: DEPARTMENT_OPTS },
  { label: "Primary Track", key: "primary_track", type: "TEXT" },
  { label: "Secondary Track", key: "secondary_track", type: "TEXT" },
  { label: "Ongoing Track", key: "ongoing_track", type: "TEXT" },
  { label: "Ongoing Start", key: "ongoing_start", type: "DATE" },
  { label: "Deadline", key: "track_deadline", type: "DATE" },
];
// --- Dropdown option sets for the editable post-module columns ---
export const REPORTING_DAY_OPTS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "NONE", "DEPLOYED"];
const SEM_OPTS: Record<string, string[]> = {
  tech: ["BACKENDPROJECTS", "DEVELOPER FOUNDATION", "DIA", "DSA", "DYNAMIC", "FRONT END PROJECTS", "GEN AI", "IPS", "JS ESSENTIALS", "JS SPRINT", "LLM", "MODERN RESPONSIVE", "MONGO DB", "NODE JS", "PYTHON", "REACT JS", "RESPONSIVE", "SQL", "STATIC", "NONE", "WORK FROM HOME", "MERN"],
  math_aptitude: ["Quanitative Aptitude", "Numerical Ability", "Logical Reasoning", "Advanced Aptitude", "Mathematics for Computer science", "Probability and Statistics", "Linear Algebra and Calculus", "In Training", "Work From Home"],
  english: ["Communicative English Foundation", "Communicative English Advanced", "Communicative English Applied", "Language Analytics", "WORK FROM HOME", "NA"],
};

// Post-module columns shown AFTER the module columns, in display order (matches the source sheets).
// Computed cells (group "Summary") are recomputed live and rendered read-only; the rest are editable.
export type TrainingColDef = { label: string; key: string; storage: "value"; type: string; group: string; options: string[] };
const sem1 = (t: string): TrainingColDef => ({ label: "SEM 1", key: "sem1", storage: "value", type: "DROPDOWN", group: "", options: SEM_OPTS[t] });
const sem2 = (t: string): TrainingColDef => ({ label: "SEM 2", key: "sem2", storage: "value", type: "DROPDOWN", group: "", options: SEM_OPTS[t] });
const repDay: TrainingColDef = { label: "Reporting Day", key: "reporting_day", storage: "value", type: "DROPDOWN", group: "", options: REPORTING_DAY_OPTS };
const remarks: TrainingColDef = { label: "Remarks", key: "remarks", storage: "value", type: "TEXT", group: "", options: [] };
const otherLearn: TrainingColDef = { label: "Other learnings", key: "other_learnings", storage: "value", type: "TEXT", group: "", options: [] };
const cmp = (label: string, key: string, type: string): TrainingColDef => ({ label, key, storage: "value", type, group: "Summary", options: [] });
const PRIMARY_PCT = cmp("Primary % Done", "primary_pct", "NUMBER");
const PRIMARY_HEALTH = cmp("Health Status", "health_status", "TEXT");
const PRIMARY_PRED = cmp("Predicted Completion", "predicted_completion", "TEXT");
const SECONDARY_PCT = cmp("Secondary % Done", "secondary_pct", "NUMBER");
const SECONDARY_HEALTH = cmp("Health Status", "secondary_health_status", "TEXT");
const SECONDARY_PRED = cmp("Predicted Completion", "secondary_predicted_completion", "TEXT");

export function summaryColumnsFor(track: string): TrainingColDef[] {
  if (track === "tech") return [PRIMARY_PCT, PRIMARY_HEALTH, PRIMARY_PRED, SECONDARY_PCT, SECONDARY_HEALTH, SECONDARY_PRED, sem1("tech"), sem2("tech"), repDay, otherLearn, remarks];
  if (track === "math_aptitude") return [sem1("math_aptitude"), sem2("math_aptitude"), repDay, PRIMARY_PCT, PRIMARY_HEALTH, PRIMARY_PRED, SECONDARY_PCT, SECONDARY_HEALTH, SECONDARY_PRED, remarks];
  if (track === "english") return [sem1("english"), sem2("english"), repDay, PRIMARY_PCT, PRIMARY_HEALTH, PRIMARY_PRED, remarks];
  return [];
}

// On first use, materialise the hardcoded taxonomy into editable TrainingColumn docs.
let _backfilled = false;
export async function seedTrainingColumns() {
  const { TrainingColumn } = await import("../models");
  if ((await TrainingColumn.countDocuments()) === 0) {
    const docs: any[] = [];
    for (const tab of TRAINING_TABS) {
      let order = 0;
      for (const c of CONTEXT_SEED) docs.push({ track: tab.key, group: "Context", label: c.label, key: c.key, storage: "value", type: c.type, options: c.options || [], order: order++ });
      // STATUS columns carry their (editable) option set so admins can rename/add statuses.
      for (const g of tab.groups) for (const m of g.modules) docs.push({ track: tab.key, group: g.name, label: m, key: m, storage: "module", type: "STATUS", options: [...STATUS_OPTIONS], order: order++ });
      for (const s of summaryColumnsFor(tab.key)) docs.push({ track: tab.key, group: s.group, label: s.label, key: s.key, storage: "value", type: s.type, options: s.options, order: order++ });
    }
    if (docs.length) await TrainingColumn.insertMany(docs);
  }
  // One-time backfill: give any pre-existing STATUS column the default editable options,
  // and promote the Department context column to a DROPDOWN with its fixed picklist.
  if (!_backfilled) {
    await TrainingColumn.updateMany({ type: "STATUS", options: { $size: 0 } }, { $set: { options: [...STATUS_OPTIONS] } });
    await TrainingColumn.updateMany({ key: "department" }, { $set: { type: "DROPDOWN", options: [...DEPARTMENT_OPTS] } });
    _backfilled = true;
  }
}

// Read-only context + editable summary fields surfaced in the grid.
export const CTX_KEYS = [
  "department", "primary_track", "secondary_track", "ongoing_track",
  "ongoing_start", "track_deadline", "primary_pct", "secondary_pct",
  "health_status", "predicted_completion",
];
