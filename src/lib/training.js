// Training-stats taxonomy: which module columns belong to each track tab,
// how to classify an instructor into a tab, and status colour normalisation.
// Mirrors the Google Sheet tabs (TECH / Mathematical&Aptitude / ENGLISH).

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

// Each tab gets a flattened `modules` list for quick lookups.
export const TRAINING_TABS = TABS.map((t) => ({
  ...t,
  modules: t.groups.flatMap((g) => g.modules),
}));

export const TAB_BY_KEY = Object.fromEntries(TRAINING_TABS.map((t) => [t.key, t]));

// Decide which tab an instructor belongs to (or null = not a training row).
export function tabForInstructor(values = {}, moduleStatus = {}) {
  const track = String(values.primary_track || "").trim().toLowerCase();
  const dept = String(values.department || "").trim().toLowerCase();

  if (track === "english" || dept.includes("english")) return "english";
  if (["mathematics", "maths", "math", "aptitude"].includes(track) ||
      dept.includes("mathematic") || dept.includes("aptitude") || dept.includes("logical reasoning"))
    return "math_aptitude";
  if (["frontend", "backend", "dsa", "gen ai", "genai", "dsml"].includes(track) ||
      dept.includes("frontend") || dept.includes("backend") || dept.includes("data structures") ||
      dept.includes("gen ai") || dept.includes("interdisciplinary"))
    return "tech";

  // Fallback: best overlap between stored module keys and a tab's module set.
  const keys = Object.keys(moduleStatus || {});
  if (keys.length) {
    let best = null, bestScore = 0;
    for (const t of TRAINING_TABS) {
      const sc = t.modules.filter((m) => keys.includes(m)).length;
      if (sc > bestScore) { bestScore = sc; best = t.key; }
    }
    if (best) return best;
  }
  return null;
}

// The four canonical statuses written by the editor (stored as plain text).
export const STATUS_OPTIONS = ["Completed", "In Progress", "On Hold", "Not Started"];

// Map any stored value (incl. legacy emoji prefixes) to a colour tone.
export function statusTone(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s.trim()) return "empty";
  if (s.includes("complet")) return "completed";
  if (s.includes("progress")) return "progress";
  if (s.includes("hold")) return "hold";
  if (s.includes("not start") || s.includes("notstart")) return "notstarted";
  return "other";
}

// Text/number value-fields that are editable inline in the grid.
export const EDITABLE_VALUE_FIELDS = [
  "primary_pct", "secondary_pct", "health_status", "predicted_completion",
];
