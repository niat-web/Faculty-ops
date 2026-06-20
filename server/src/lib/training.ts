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

// Context value-columns shown BEFORE the module columns (stored in Instructor.values).
const CONTEXT_SEED = [
  { label: "Department", key: "department", type: "TEXT" },
  { label: "Primary Track", key: "primary_track", type: "TEXT" },
  { label: "Secondary Track", key: "secondary_track", type: "TEXT" },
  { label: "Ongoing Track", key: "ongoing_track", type: "TEXT" },
  { label: "Ongoing Start", key: "ongoing_start", type: "DATE" },
  { label: "Deadline", key: "track_deadline", type: "DATE" },
];
// Summary value-columns shown AFTER the module columns.
const SUMMARY_SEED = [
  { label: "Primary %", key: "primary_pct", type: "NUMBER" },
  { label: "Secondary %", key: "secondary_pct", type: "NUMBER" },
  { label: "Health", key: "health_status", type: "TEXT" },
  { label: "Predicted Completion", key: "predicted_completion", type: "TEXT" },
];

// On first use, materialise the hardcoded taxonomy into editable TrainingColumn docs.
let _backfilled = false;
export async function seedTrainingColumns() {
  const { TrainingColumn } = await import("../models");
  if ((await TrainingColumn.countDocuments()) === 0) {
    const docs: any[] = [];
    for (const tab of TRAINING_TABS) {
      let order = 0;
      for (const c of CONTEXT_SEED) docs.push({ track: tab.key, group: "Context", label: c.label, key: c.key, storage: "value", type: c.type, options: [], order: order++ });
      // STATUS columns carry their (editable) option set so admins can rename/add statuses.
      for (const g of tab.groups) for (const m of g.modules) docs.push({ track: tab.key, group: g.name, label: m, key: m, storage: "module", type: "STATUS", options: [...STATUS_OPTIONS], order: order++ });
      for (const s of SUMMARY_SEED) docs.push({ track: tab.key, group: "Summary", label: s.label, key: s.key, storage: "value", type: s.type, options: [], order: order++ });
    }
    if (docs.length) await TrainingColumn.insertMany(docs);
  }
  // One-time backfill: give any pre-existing STATUS column the default editable options.
  if (!_backfilled) {
    await TrainingColumn.updateMany({ type: "STATUS", options: { $size: 0 } }, { $set: { options: [...STATUS_OPTIONS] } });
    _backfilled = true;
  }
}

// Read-only context + editable summary fields surfaced in the grid.
export const CTX_KEYS = [
  "department", "primary_track", "secondary_track", "ongoing_track",
  "ongoing_start", "track_deadline", "primary_pct", "secondary_pct",
  "health_status", "predicted_completion",
];
