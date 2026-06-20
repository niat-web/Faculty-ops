import { Instructor, EditRequest, User, AuditLog } from "../models";
import { Role, LIFECYCLE_LABEL } from "../enums";
import type { SessionUser } from "./rbac";
import { instructorScopeFilter } from "./rbac";
import { maybeDecrypt } from "./crypto";

const num = (v: any) => { const n = Number(v); return isNaN(n) ? null : n; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Role-aware dashboard payload (KPIs + chart series + role-specific lists).
export async function dashboardData(user: SessionUser) {
  const scope = instructorScopeFilter(user);
  // Pull the scoped instructors once and compute most series in memory (mirrors the old app).
  // Deterministic order so an instructor with a duplicate email always resolves to the same self-record.
  const docs: any[] = await Instructor.find(scope).select("employeeId name status campus currentManagerId values createdAt").sort({ createdAt: -1 }).lean();

  const total = docs.length;
  const campuses = new Set(docs.map((d) => (d.campus || "").trim()).filter(Boolean)).size;
  const trainingVals = docs.map((d) => num(maybeDecrypt(d.values?.primary_pct))).filter((n): n is number => n != null);
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
    charts.reporteeProgress = docs.map((d) => ({ id: String(d._id), name: d.name, status: d.status, value: num(maybeDecrypt(d.values?.primary_pct)) || 0 })).sort((a, b) => b.value - a.value);
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
        training: num(maybeDecrypt(me.values?.primary_pct)) || 0,
        review: maybeDecrypt(me.values?.review_score) || null,
        track: maybeDecrypt(me.values?.primary_track) || null,
        deadline: maybeDecrypt(me.values?.track_deadline) || null,
        manager,
      };
    } else payload.me = null;
  }

  return payload;
}
