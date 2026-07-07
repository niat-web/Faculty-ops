import { Instructor, EditRequest, User, AuditLog, TrainingColumn } from "../models";
import { Role, LIFECYCLE_LABEL } from "../enums";
import type { SessionUser } from "./rbac";
import { instructorScopeFilter } from "./rbac";
import { maybeDecrypt } from "./crypto";
import { tabForInstructor } from "./training";
import { computeSummary, type TrainingSummary } from "./trainingScore";
import { fetchTrainingProgress, type TrainingProgressSync } from "./bigqueryTraining";

const num = (v: any) => { const n = Number(v); return isNaN(n) ? null : n; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MANUAL_MODULE_KEYS = new Set(["Frontend Projects", "Backend Projects"]);
type DocWithSummary = any & { liveTraining?: TrainingSummary | null; livePrimaryPct?: number | null };
const dayMs = 24 * 60 * 60 * 1000;

export async function attachLiveTrainingSummaries(docs: DocWithSummary[], opts?: { fresh?: boolean }): Promise<TrainingProgressSync | null> {
  if (!docs.length) return null;
  const moduleCols: any[] = await TrainingColumn.find({ archivedAt: null, storage: "module" }).select("track key courseId").lean();
  const live: Record<string, string[]> = {};
  for (const c of moduleCols) (live[c.track] ||= []).push(c.key);
  const syncCols = moduleCols.filter((c) => c.courseId && !MANUAL_MODULE_KEYS.has(c.key));
  const progress = await fetchTrainingProgress(
    syncCols.map((c) => ({ key: c.key, courseId: c.courseId })),
    docs.map((d) => ({ id: String(d._id), employeeId: d.employeeId, email: d.email, uid: d.uid })),
    opts
  );
  for (const d of docs) {
    const values = d.values || {};
    const tab = tabForInstructor(values, d.moduleStatus || {}, live);
    if (!tab) continue;
    const ms = { ...(d.moduleStatus || {}) };
    const updates = progress.ok ? progress.cells[String(d._id)] : null;
    for (const col of syncCols) {
      if (updates?.[col.key]) ms[col.key] = updates[col.key];
      else delete ms[col.key];
    }
    const summary = computeSummary(values, ms, tab);
    d.liveTraining = summary;
    d.livePrimaryPct = summary.primaryPct == null ? null : Math.round(summary.primaryPct * 100);
  }
  return progress;
}

function daysUntil(date: any) {
  const t = Date.parse(String(date || ""));
  if (isNaN(t)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / dayMs);
}

function gapDays(predicted: string, deadline: any) {
  if (!predicted || predicted === "Completed" || predicted === "N/A") return 0;
  const p = Date.parse(predicted.replace(/-/g, " "));
  const d = Date.parse(String(deadline || ""));
  if (isNaN(p) || isNaN(d)) return 0;
  return Math.abs(Math.round((p - d) / dayMs));
}

// Role-aware dashboard payload (KPIs + chart series + role-specific lists).
// `live=false` (default) renders purely from MongoDB (last-saved training %) so the page is instant;
// `live=true` layers the BigQuery values on top and attaches a `trainingSync` status — the client calls
// the live variant in the background and patches only the training-derived widgets.
export async function dashboardData(user: SessionUser, live = false, opts?: { fresh?: boolean }) {
  const scope = instructorScopeFilter(user);
  // Pull the scoped instructors once and compute most series in memory (mirrors the old app).
  // Deterministic order so an instructor with a duplicate email always resolves to the same self-record.
  const docs: DocWithSummary[] = await Instructor.find(scope).select("employeeId name email uid status campus currentManagerId values moduleStatus createdAt").sort({ createdAt: -1 }).lean();
  const progress = live ? await attachLiveTrainingSummaries(docs, opts) : null;

  const total = docs.length;
  const campuses = new Set(docs.map((d) => (d.campus || "").trim()).filter(Boolean)).size;
  const trainingVals = docs.map((d) => d.livePrimaryPct ?? num(maybeDecrypt(d.values?.primary_pct))).filter((n): n is number => n != null);
  const avgTraining = trainingVals.length ? Math.round(trainingVals.reduce((a, b) => a + b, 0) / trainingVals.length) : 0;
  const exited = docs.filter((d) => d.status === "EXITED").length;
  const exiting = docs.filter((d) => d.status === "EXITED" || d.status === "EXIT_IN_PROGRESS").length;

  // status breakdown
  const statusMap: Record<string, number> = {};
  for (const d of docs) statusMap[d.status] = (statusMap[d.status] || 0) + 1;
  const byStatus = Object.entries(statusMap).map(([status, n]) => ({ name: LIFECYCLE_LABEL[status] || status, status, value: n, n }));

  // campus breakdown (desc)
  const campusMap: Record<string, number> = {};
  for (const d of docs) { const c = (d.campus || "").trim(); if (c) campusMap[c] = (campusMap[c] || 0) + 1; }
  const byCampus = Object.entries(campusMap).map(([campus, n]) => ({ name: campus, campus, value: n, n })).sort((a, b) => b.value - a.value);

  // training buckets (4 bands)
  const buckets = [{ name: "0–25%", value: 0 }, { name: "26–50%", value: 0 }, { name: "51–75%", value: 0 }, { name: "76–100%", value: 0 }];
  for (const v of trainingVals) { if (v <= 25) buckets[0].value++; else if (v <= 50) buckets[1].value++; else if (v <= 75) buckets[2].value++; else buckets[3].value++; }

  // joins by month (trailing 6)
  const joins: { name: string; value: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const n = docs.filter((x) => x.createdAt && new Date(x.createdAt) >= d && new Date(x.createdAt) < next).length;
    joins.push({ name: MONTHS[d.getMonth()], value: n });
  }

  // pending — role-specific
  let pending = 0;
  if (user.role === Role.SENIOR_MANAGER) pending = await EditRequest.countDocuments({ approverId: user.id, status: "PENDING" });
  else if (user.role === Role.OPS_ADMIN) pending = await EditRequest.countDocuments({ status: "PENDING" });
  else if (user.role === Role.CAPABILITY_MANAGER) pending = await EditRequest.countDocuments({ requesterId: user.id, status: "PENDING" });

  const kpis: any = { total, campuses, avgTraining, exited, exiting, pending };
  const charts: any = { byStatus, byCampus, trainingBuckets: buckets, joins };
  const payload: any = { role: user.role, kpis, charts };

  // ── Ops/SM: manager workload + (Ops) recent activity ──
  if (user.role === Role.OPS_ADMIN || user.role === Role.SENIOR_MANAGER) {
    const wlMap: Record<string, number> = {};
    for (const d of docs) { const m = d.currentManagerId ? String(d.currentManagerId) : null; if (m) wlMap[m] = (wlMap[m] || 0) + 1; }
    const mgrIds = Object.keys(wlMap);
    const mgrs = mgrIds.length ? await User.find({ _id: { $in: mgrIds } }).select("name").lean() : [];
    const mgrName = Object.fromEntries(mgrs.map((m: any) => [String(m._id), m.name]));
    charts.workload = mgrIds.map((id) => ({ name: mgrName[id] || "—", value: wlMap[id] })).sort((a, b) => b.value - a.value).slice(0, 12);
    const [ops, sm, cm] = await Promise.all([
      User.countDocuments({ role: Role.OPS_ADMIN }), User.countDocuments({ role: Role.SENIOR_MANAGER }), User.countDocuments({ role: Role.CAPABILITY_MANAGER }),
    ]);
    Object.assign(kpis, { ops, sm, cm });
    // Recently added instructors (docs already sorted createdAt desc) for the "Recently added" widget.
    payload.recentJoiners = docs.slice(0, 5).map((d) => ({ id: String(d._id), name: d.name, campus: d.campus || null, status: d.status, createdAt: d.createdAt }));
  }
  if (user.role === Role.OPS_ADMIN) {
    const recent = await AuditLog.find().sort({ createdAt: -1 }).limit(6).lean();
    payload.recent = recent.map((a: any) => ({ id: String(a._id), actorName: a.actorName, action: a.action, fieldName: a.fieldName, instructorName: a.instructorName, createdAt: a.createdAt }));
  }

  // ── Capability Manager: reportee progress + upcoming deadlines ──
  if (user.role === Role.CAPABILITY_MANAGER) {
    charts.reporteeProgress = docs.map((d) => ({ id: String(d._id), name: d.name, status: d.status, value: (d.livePrimaryPct ?? num(maybeDecrypt(d.values?.primary_pct))) || 0 })).sort((a, b) => b.value - a.value);
    payload.interventions = docs
      .map((d) => {
        const health = d.liveTraining?.primaryHealth || maybeDecrypt(d.values?.health_status) || "";
        const predicted = d.liveTraining?.primaryPredicted || maybeDecrypt(d.values?.predicted_completion) || "";
        const deadline = maybeDecrypt(d.values?.track_deadline) || "";
        return {
          id: String(d._id),
          name: d.name,
          employeeId: d.employeeId,
          health,
          daysToDeadline: daysUntil(deadline),
          predictedCompletion: predicted || "—",
          gapDays: gapDays(predicted, deadline),
        };
      })
      .filter((r) => /at risk|overdue/i.test(r.health))
      .sort((a, b) => (b.gapDays || 0) - (a.gapDays || 0))
      .slice(0, 8);
    const today = new Date(); const horizon = new Date(today.getTime() + 30 * 24 * 3600 * 1000);
    payload.deadlines = docs
      .map((d) => ({ id: String(d._id), name: d.name, employeeId: d.employeeId, date: maybeDecrypt(d.values?.track_deadline) }))
      .filter((x) => x.date && !isNaN(Date.parse(x.date)) && new Date(x.date) >= today && new Date(x.date) <= horizon)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  }

  // ── Instructor: self profile summary ──
  if (user.role === Role.INSTRUCTOR) {
    const me = docs[0];
    if (me) {
      let manager: string | null = null;
      if (me.currentManagerId) { const m: any = await User.findById(me.currentManagerId).select("name").lean(); manager = m?.name || null; }
      payload.me = {
        id: String(me._id), employeeId: me.employeeId, status: me.status, campus: me.campus,
        training: (me.livePrimaryPct ?? num(maybeDecrypt(me.values?.primary_pct))) || 0,
        review: maybeDecrypt(me.values?.review_score) || null,
        track: maybeDecrypt(me.values?.primary_track) || null,
        deadline: maybeDecrypt(me.values?.track_deadline) || null,
        manager,
      };
    } else payload.me = null;
  }

  // Only the live variant carries a sync status (for the client's "Syncing…/Last synced" indicator).
  if (live) payload.trainingSync = { ok: progress ? progress.ok : true, lastSyncedAt: progress?.lastSyncedAt ?? null, error: progress && !progress.ok ? (progress.error || "BigQuery sync failed.") : undefined };
  return payload;
}
