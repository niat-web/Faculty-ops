import { LIFECYCLE_LABEL } from "./enums.js";

// Pure aggregation helpers over an array of plain instructor docs.
// Used by the role dashboards (server-side) to build chart datasets.

export function statusBreakdown(docs) {
  const m = {};
  for (const d of docs) m[d.status] = (m[d.status] || 0) + 1;
  return Object.entries(m).map(([k, v]) => ({ name: LIFECYCLE_LABEL[k] || k, value: v }));
}

export function campusBreakdown(docs) {
  const m = {};
  for (const d of docs) if (d.campus) m[d.campus] = (m[d.campus] || 0) + 1;
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function trainingValues(docs) {
  return docs.map((d) => Number(d.values?.primary_pct)).filter((x) => !isNaN(x));
}

export function trainingAverage(docs) {
  const v = trainingValues(docs);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

export function trainingBuckets(docs) {
  const buckets = [
    { name: "0–25%", value: 0 }, { name: "26–50%", value: 0 },
    { name: "51–75%", value: 0 }, { name: "76–100%", value: 0 },
  ];
  for (const v of trainingValues(docs)) {
    if (v <= 25) buckets[0].value++;
    else if (v <= 50) buckets[1].value++;
    else if (v <= 75) buckets[2].value++;
    else buckets[3].value++;
  }
  return buckets;
}

// Joins over the last `months` months, from createdAt.
export function joinsByMonth(docs, months = 6) {
  const now = new Date();
  const keys = [];
  const map = {};
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleString("en", { month: "short" });
    keys.push(key);
    map[`${d.getFullYear()}-${d.getMonth()}`] = key;
  }
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const d of docs) {
    const c = d.createdAt ? new Date(d.createdAt) : null;
    if (!c) continue;
    const k = map[`${c.getFullYear()}-${c.getMonth()}`];
    if (k) counts[k]++;
  }
  return keys.map((k) => ({ name: k, value: counts[k] }));
}

// Upcoming track deadlines within `days`.
export function upcomingDeadlines(docs, days = 30) {
  const now = new Date();
  const limit = new Date(now.getTime() + days * 86400000);
  return docs
    .map((d) => ({ name: d.name, employeeId: d.employeeId, id: String(d._id), date: d.values?.track_deadline }))
    .filter((x) => x.date && !isNaN(Date.parse(x.date)) && new Date(x.date) >= now && new Date(x.date) <= limit)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}
