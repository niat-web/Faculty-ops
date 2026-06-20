// Client-side training taxonomy (mirrors server/src/lib/training.ts) for rendering the grid.
const TABS = [
  {
    key: "tech", label: "Tech",
    groups: [
      { name: "Frontend Development", modules: ["Static Web", "Responsive Design", "Modern Responsive UI", "JavaScript Sprint", "JavaScript Essentials", "React JS", "Frontend Projects"] },
      { name: "Backend Development", modules: ["Python", "SQL", "Node JS", "MongoDB", "Developer Foundation", "Backend Projects"] },
      { name: "DSA", modules: ["DSA", "DIA", "IPS"] },
      { name: "Gen AI", modules: ["Gen AI", "LLM", "AI for Finance"] },
      { name: "DSML", modules: ["ML", "Supervised Learning", "Deep Learning", "ML Projects", "NLP", "Data Foundation"] },
    ],
  },
  {
    key: "math_aptitude", label: "Mathematical & Aptitude",
    groups: [{ name: "Mathematics & Aptitude", modules: ["Quanitative Aptitude", "Numerical Ability", "Logical Reasoning", "Advanced Aptitude", "Mathematics for Computer science", "Probability and Statistics", "Linear Algebra and Calculus"] }],
  },
  {
    key: "english", label: "English",
    groups: [{ name: "English", modules: ["Communicative English Foundation", "Communicative English Advanced", "Communicative English Applied", "Language Analytics"] }],
  },
];

export const TRAINING_TABS = TABS.map((t) => ({ ...t, modules: t.groups.flatMap((g) => g.modules) }));
export const STATUS_OPTIONS = ["Completed", "In Progress", "On Hold", "Not Started"];

export const TONE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  progress: "bg-amber-100 text-amber-800",
  hold: "bg-slate-200 text-slate-700",
  notstarted: "bg-rose-100 text-rose-700",
  other: "bg-slate-100 text-slate-600",
  empty: "bg-white text-slate-300",
};
export const SHORT: Record<string, string> = { completed: "Completed", progress: "In Progress", hold: "On Hold", notstarted: "Not Started", other: "", empty: "—" };

export function statusTone(raw: any): string {
  const s = String(raw || "").toLowerCase();
  if (!s.trim()) return "empty";
  if (s.includes("complet")) return "completed";
  if (s.includes("progress")) return "progress";
  if (s.includes("hold")) return "hold";
  if (s.includes("not start") || s.includes("notstart")) return "notstarted";
  return "other";
}

export const CTX_COLS = [
  { key: "department", label: "Department", fromRow: false },
  { key: "manager", label: "Capability Manager", fromRow: true },
  { key: "primary_track", label: "Primary Track", fromRow: false },
  { key: "secondary_track", label: "Secondary Track", fromRow: false },
  { key: "ongoing_track", label: "Ongoing Track", fromRow: false },
  { key: "ongoing_start", label: "Ongoing Start", fromRow: false },
  { key: "track_deadline", label: "Deadline", fromRow: false },
];
export const SUMMARY_COLS = [
  { key: "primary_pct", label: "Primary %" },
  { key: "secondary_pct", label: "Secondary %" },
  { key: "health_status", label: "Health" },
  { key: "predicted_completion", label: "Predicted Completion" },
];
