// Live computation of Training-Stats summary columns on the client, so the
// %, Health and Predicted Completion cells update instantly when a dropdown
// changes (no reload). MUST stay in sync with server/src/lib/trainingScore.ts.

// Predicted Completion is now a MANUAL date (editable in the grid), so it's NOT auto-computed.
export const COMPUTED_KEYS = [
  "primary_pct", "secondary_pct",
  "health_status", "secondary_health_status",
] as const;

const FE = ["Static Web", "Responsive Design", "Modern Responsive UI", "JavaScript Sprint", "JavaScript Essentials", "React JS", "Frontend Projects"];
const BE = ["Python", "SQL", "Node JS", "MongoDB", "Developer Foundation", "Backend Projects"];
const DSA = ["DSA", "DIA", "IPS"];
const GENAI = ["Gen AI", "LLM", "AI for Finance"];
const DSML = ["ML", "Supervised Learning", "Deep Learning", "ML Projects", "NLP", "Data Foundation"];
const ALL_TECH = [...FE, ...BE, ...DSA, ...GENAI];
const APT = ["Quanitative Aptitude", "Numerical Ability", "Logical Reasoning", "Advanced Aptitude"];
const MATHS = ["Mathematics for Computer science", "Probability and Statistics", "Linear Algebra and Calculus"];
const ENG = ["Communicative English Foundation", "Communicative English Advanced", "Communicative English Applied", "Language Analytics"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function score(status: string): number {
  const s = String(status || "").toLowerCase();
  if (s.includes("complet")) return 1;
  if (s.includes("progress")) return 0.5;
  if (s.includes("hold")) return 0.2;
  return 0;
}
function avg(mods: string[], ms: Record<string, string>): number {
  let sum = 0;
  for (const m of mods) sum += score(ms[m] || "");
  return mods.length ? sum / mods.length : 0;
}
const norm = (s: any) => String(s || "").trim().toLowerCase();

function pctFor(track: string, trackName: string, ms: Record<string, string>): number | null {
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
    if (t === "mathematics for computer science") return score(ms["Mathematics for Computer science"] || "");
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
  if (startMs == null || deadlineMs == null) return "⚫ Overdue";
  if (deadlineMs <= startMs) return "⚫ Overdue";
  if (now > deadlineMs) return "⚫ Overdue";
  if (pct === 0) return "❌ Not Started";
  if (pct >= 1) return "🟢 On Track";
  const diff = (now - startMs) / (deadlineMs - startMs) - pct;
  if (diff < 0.1) return "🟢 On Track";
  if (diff < 0.25) return "🟡 Needs Monitoring";
  return "🔴 At Risk";
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
  const secondaryPct = pctFor(track, values.secondary_track || "", ms);
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
  const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);
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
