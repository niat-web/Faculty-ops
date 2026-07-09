// Live computation of Training-Stats summary columns on the client, so the
// %, Health and Predicted Completion cells update instantly when a dropdown
// changes (no reload). MUST stay in sync with server/src/lib/trainingScore.ts.

export const COMPUTED_KEYS = [
  "primary_pct", "secondary_pct",
  "health_status", "predicted_completion",
  "secondary_health_status", "secondary_predicted_completion",
] as const;

const FE = ["Static Web", "Responsive Design", "Modern Responsive UI", "JavaScript Sprint", "JavaScript Essentials", "React JS", "Frontend Projects"];
const BE = ["Python", "SQL", "Node JS", "MongoDB", "Developer Foundation", "Backend Projects"];
const DSA = ["DSA", "DIA", "IPS"];
const GENAI = ["Gen AI", "LLM", "AI for Finance"];
const DSML = ["ML", "Supervised Learning", "Deep Learning", "ML Projects", "NLP", "Data Foundation"];
const ALL_TECH = [...FE, ...BE, ...DSA, ...GENAI];
const APT = ["Quanitative Aptitude", "Numerical Ability", "Logical Reasoning", "Advanced Aptitude"];
const MATHS = ["Mathematics for Computer science", "Probability and Statistics", "Linear Algebra and Calculus"];
const MATH_CS_ALL = [...APT, ...MATHS];
const ENG = ["Communicative English Foundation", "Communicative English Advanced", "Communicative English Applied", "Language Analytics"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Live BigQuery cells embed the real completion %, e.g. "In Progress (99%)" → 0.99.
// Manual cells (no %) fall back to the coarse bucket. MUST match server/src/lib/trainingScore.ts.
function score(status: string): number {
  const s = String(status || "");
  const m = s.match(/\((\d+(?:\.\d+)?)\s*%\)/);
  if (m) return Math.max(0, Math.min(1, Number(m[1]) / 100));
  const l = s.toLowerCase();
  if (l.includes("complet")) return 1;
  if (l.includes("progress")) return 0.5;
  if (l.includes("hold")) return 0.2;
  return 0;
}
function avg(mods: string[], ms: Record<string, string>): number {
  let sum = 0;
  for (const m of mods) sum += score(ms[m] || "");
  return mods.length ? sum / mods.length : 0;
}
const norm = (s: any) => String(s || "").trim().toLowerCase();

// `isSecondary` matches the sheet's split rule for "Mathematics for Computer science":
// PRIMARY = 7-module average; SECONDARY = the single module. MUST match the server.
function pctFor(track: string, trackName: string, ms: Record<string, string>, isSecondary = false): number | null {
  const t = norm(trackName);
  if (!t || t === "na") return null;
  if (track === "tech") {
    if (t === "frontend") return avg(FE, ms);
    if (t === "backend") return avg(BE, ms);
    if (t === "dsa") return avg(DSA, ms);
    if (t === "gen ai" || t === "genai") return avg(GENAI, ms);
    if (t === "dsml") return avg(DSML, ms);
    if (t === "all") return avg(ALL_TECH, ms);
    return avg(ALL_TECH, ms);
  }
  if (track === "math_aptitude") {
    if (t === "aptitude") return avg(APT, ms);
    if (t === "mathematics") return avg(MATHS, ms);
    if (t === "mathematics for computer science")
      return isSecondary ? score(ms["Mathematics for Computer science"] || "") : avg(MATH_CS_ALL, ms);
    return null;
  }
  if (track === "english") return avg(ENG, ms);
  return null;
}

function parseMs(s: string): number | null {
  if (!s) return null;
  const t = Date.parse(String(s));
  return isNaN(t) ? null : t;
}
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
function health(pct: number | null, startMs: number | null, deadlineMs: number | null, now: number): string {
  if (pct == null) return "";
  if (startMs == null || deadlineMs == null) return "Overdue";
  if (deadlineMs <= startMs) return "Overdue";
  if (now > deadlineMs) return "Overdue";
  if (pct === 0) return "Not Started";
  if (pct >= 1) return "On Track";
  const diff = (now - startMs) / (deadlineMs - startMs) - pct;
  if (diff < 0.1) return "On Track";
  if (diff < 0.25) return "Needs Monitoring";
  return "At Risk";
}

// Health-status display helpers (label carries no emoji now; colour conveys the state instead).
const HEALTH_KEYS = new Set(["health_status", "secondary_health_status"]);
export const isHealthKey = (k: string) => HEALTH_KEYS.has(k);
// Strip any leading emoji/symbol from legacy stored values so old data reads plain too.
export const stripHealthEmoji = (v: any) => String(v ?? "").replace(/^[^A-Za-z0-9]+/, "").trim();
// The chip colour matching the old emoji: On Track = green, Needs Monitoring = amber, At Risk / Not
// Started = red, Overdue = grey.
export function healthChipClass(v: any): string {
  const s = stripHealthEmoji(v).toLowerCase();
  if (s.includes("on track")) return "bg-emerald-50 text-emerald-700";
  if (s.includes("needs monitoring")) return "bg-amber-50 text-amber-700";
  if (s.includes("at risk") || s.includes("not started")) return "bg-rose-50 text-rose-600";
  if (s.includes("overdue")) return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-500";
}
function predicted(pct: number | null, startMs: number | null, now: number): string {
  if (pct == null) return "";
  if (startMs == null || pct === 0) return "N/A";
  if (pct >= 1) return "Completed";
  return fmtDate(startMs + (now - startMs) / pct);
}

export interface TrainingSummary {
  primaryPct: number | null; secondaryPct: number | null;
  primaryHealth: string; primaryPredicted: string;
  secondaryHealth: string; secondaryPredicted: string;
}

export function computeSummary(values: Record<string, string>, moduleStatus: Record<string, string>, track: string, now: number = Date.now()): TrainingSummary {
  const ms = moduleStatus || {};
  const startMs = parseMs(values.ongoing_start || "");
  const deadlineMs = parseMs(values.track_deadline || "");
  const primaryPct = pctFor(track, values.primary_track || "", ms);
  const secondaryPct = pctFor(track, values.secondary_track || "", ms, true);
  return {
    primaryPct, secondaryPct,
    primaryHealth: health(primaryPct, startMs, deadlineMs, now),
    primaryPredicted: predicted(primaryPct, startMs, now),
    secondaryHealth: health(secondaryPct, startMs, deadlineMs, now),
    secondaryPredicted: predicted(secondaryPct, startMs, now),
  };
}

// Tone key (matches TONE in training.ts) for a Health value.
export function healthTone(text: string): string {
  const s = text.toLowerCase();
  if (s.includes("on track")) return "completed";
  if (s.includes("needs monitoring")) return "progress";
  if (s.includes("at risk")) return "notstarted";
  if (s.includes("not started")) return "notstarted";
  return "hold"; // Overdue / blank
}

// Display text + optional tone for a computed cell, by its column key.
export function summaryCell(key: string, s: TrainingSummary): { text: string; tone?: string } {
  // One-decimal %, matching the source sheet (e.g. 66.7%, not a rounded 67%).
  const pct = (p: number | null) => (p == null ? "—" : `${(p * 100).toFixed(1)}%`);
  switch (key) {
    case "primary_pct": return { text: pct(s.primaryPct) };
    case "secondary_pct": return { text: pct(s.secondaryPct) };
    case "health_status": return { text: s.primaryHealth || "—", tone: s.primaryHealth ? healthTone(s.primaryHealth) : undefined };
    case "secondary_health_status": return { text: s.secondaryHealth || "—", tone: s.secondaryHealth ? healthTone(s.secondaryHealth) : undefined };
    case "predicted_completion": return { text: s.primaryPredicted || "—" };
    case "secondary_predicted_completion": return { text: s.secondaryPredicted || "—" };
    default: return { text: "—" };
  }
}
