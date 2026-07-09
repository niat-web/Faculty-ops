// Live computation of Training-Stats summary columns (Primary/Secondary %,
// Health Status, Predicted Completion) from module dropdowns + tracks + dates.
// Mirrors the Google-Sheet formulas. Keep IN SYNC with client/src/trainingScore.ts.

// Keys whose values are COMPUTED (never stored-as-edited / never editable in the grid).
export const COMPUTED_KEYS = [
  "primary_pct", "secondary_pct",
  "health_status", "predicted_completion",
  "secondary_health_status", "secondary_predicted_completion",
] as const;

// Module membership per sub-track (matches the training taxonomy / sheet columns).
const FE = ["Static Web", "Responsive Design", "Modern Responsive UI", "JavaScript Sprint", "JavaScript Essentials", "React JS", "Frontend Projects"];
const BE = ["Python", "SQL", "Node JS", "MongoDB", "Developer Foundation", "Backend Projects"];
const DSA = ["DSA", "DIA", "IPS"];
const GENAI = ["Gen AI", "LLM", "AI for Finance"];
const DSML = ["ML", "Supervised Learning", "Deep Learning", "ML Projects", "NLP", "Data Foundation"];
const ALL_TECH = [...FE, ...BE, ...DSA, ...GENAI]; // 19 — note: excludes DSML, per the sheet
const APT = ["Quanitative Aptitude", "Numerical Ability", "Logical Reasoning", "Advanced Aptitude"];
const MATHS = ["Mathematics for Computer science", "Probability and Statistics", "Linear Algebra and Calculus"];
const MATH_CS_ALL = [...APT, ...MATHS];
const ENG = ["Communicative English Foundation", "Communicative English Advanced", "Communicative English Applied", "Language Analytics"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// status string → numeric weight (0..1).
// Live BigQuery cells embed the real completion %, e.g. "In Progress (99%)" → 0.99,
// so a near-done module counts as near-done. Manual cells (no %) fall back to the
// coarse status bucket: Completed=1, In Progress=0.5, On Hold=0.2, else 0.
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

// Percent (0..1) for a given track + sub-track name. null = not applicable (blank cell).
// `isSecondary` matches the sheet's split rule for "Mathematics for Computer science":
// as a PRIMARY track it's the 7-module average; as a SECONDARY track it's the single module.
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
    return avg(ALL_TECH, ms); // default → the 19 core modules (matches the sheet)
  }
  if (track === "math_aptitude") {
    if (t === "aptitude") return avg(APT, ms);
    if (t === "mathematics") return avg(MATHS, ms);
    if (t === "mathematics for computer science")
      return isSecondary ? score(ms["Mathematics for Computer science"] || "") : avg(MATH_CS_ALL, ms);
    return null;
  }
  if (track === "english") return avg(ENG, ms); // English has only a primary track
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

// Health Status from pace vs. elapsed time (sheet formula).
function health(pct: number | null, startMs: number | null, deadlineMs: number | null, todayMs: number): string {
  if (pct == null) return "";
  if (startMs == null || deadlineMs == null) return "Overdue";
  if (deadlineMs <= startMs) return "Overdue";
  if (todayMs > deadlineMs) return "Overdue";
  if (pct === 0) return "Not Started";
  if (pct >= 1) return "On Track";
  const expected = (todayMs - startMs) / (deadlineMs - startMs);
  const diff = expected - pct;
  if (diff < 0.1) return "On Track";
  if (diff < 0.25) return "Needs Monitoring";
  return "At Risk";
}

// Predicted Completion date from current pace (sheet formula).
function predicted(pct: number | null, startMs: number | null, todayMs: number): string {
  if (pct == null) return "";
  if (startMs == null || pct === 0) return "N/A";
  if (pct >= 1) return "Completed";
  return fmtDate(startMs + (todayMs - startMs) / pct);
}

export interface TrainingSummary {
  primaryPct: number | null;
  secondaryPct: number | null;
  primaryHealth: string;
  primaryPredicted: string;
  secondaryHealth: string;
  secondaryPredicted: string;
}

// The single source of truth — pure function of an instructor's row.
export function computeSummary(values: Record<string, string>, moduleStatus: Record<string, string>, track: string, now: number = Date.now()): TrainingSummary {
  const ms = moduleStatus || {};
  const startMs = parseMs(values.ongoing_start || "");
  const deadlineMs = parseMs(values.track_deadline || "");
  const primaryPct = pctFor(track, values.primary_track || "", ms);
  const secondaryPct = pctFor(track, values.secondary_track || "", ms, true);
  return {
    primaryPct,
    secondaryPct,
    primaryHealth: health(primaryPct, startMs, deadlineMs, now),
    primaryPredicted: predicted(primaryPct, startMs, now),
    secondaryHealth: health(secondaryPct, startMs, deadlineMs, now),
    secondaryPredicted: predicted(secondaryPct, startMs, now),
  };
}

// Store one-decimal % (e.g. "66.7"), matching the source sheet instead of a rounded "67".
const pctStr = (p: number | null) => (p == null ? "" : (p * 100).toFixed(1));

// Map a computed key → its stored string form (pct as 0..100 integer; others as text).
export function summaryStored(s: TrainingSummary): Record<string, string> {
  // so it's intentionally excluded here — recompute won't overwrite the user's chosen date.
  return {
    primary_pct: pctStr(s.primaryPct),
    secondary_pct: pctStr(s.secondaryPct),
    health_status: s.primaryHealth,
    predicted_completion: s.primaryPredicted,
    secondary_health_status: s.secondaryHealth,
    secondary_predicted_completion: s.secondaryPredicted,
  };
}
