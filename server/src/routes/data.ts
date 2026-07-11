import { Router } from "express";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { config } from "../config";
import { fetchBigQueryRows, streamBigQueryCsv, bigQueryFacets } from "../lib/bigqueryTraining";
import { fetchDarwinboxRows, streamDarwinboxCsv, darwinboxFacets } from "../lib/darwinbox";
import { buildDarwinboxSyncPlan, applyDarwinboxSync } from "../lib/darwinboxSync";

// Raw external data browser (Data page) — Ops Admin only: it exposes source-system
// records without the app's field-level visibility filtering.
const router = Router();
router.use(requireUser([Role.OPS_ADMIN]));

function paging(req: any) {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const q = String(req.query.q || "").trim();
  return { limit, offset, q };
}

// Per-column filters arrive as a JSON object in ?filters={"col":["v1","v2"],…}. Parse defensively.
function parseFilters(raw: any): Record<string, string[]> {
  if (!raw) return {};
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(obj)) if (Array.isArray(v) && v.length) out[String(k)] = v.map((x) => String(x));
    return out;
  } catch { return {}; }
}

// Which sources are configured — the page uses this to label the two options.
router.get("/sources", (_req, res) => {
  res.json({
    bigquery: {
      configured: Boolean(config.bigQuery.projectId && config.bigQuery.dataset && config.bigQuery.table && config.bigQuery.credentials),
      label: `${config.bigQuery.dataset}.${config.bigQuery.table}`,
    },
    darwinbox: {
      configured: Boolean(config.darwinbox.endpoint && config.darwinbox.apiKey && config.darwinbox.datasetKey),
      label: config.darwinbox.endpoint,
    },
  });
});

router.get("/bigquery", async (req, res) => {
  const { limit, offset, q } = paging(req);
  const page = await fetchBigQueryRows(limit, offset, q || undefined, parseFilters(req.query.filters));
  res.status(page.ok ? 200 : 502).json(page);
});

router.get("/darwinbox", async (req, res) => {
  const { limit, offset, q } = paging(req);
  const refresh = String(req.query.refresh || "") === "1";
  const page = await fetchDarwinboxRows(limit, offset, q || undefined, refresh, parseFilters(req.query.filters));
  res.status(page.ok ? 200 : 502).json(page);
});

// Unique values per column across the WHOLE dataset — powers the filter dropdowns.
router.get("/bigquery/facets", async (req, res) => {
  const r = await bigQueryFacets(String(req.query.refresh || "") === "1");
  res.status(r.ok ? 200 : 502).json(r);
});
router.get("/darwinbox/facets", async (req, res) => {
  const r = await darwinboxFacets(String(req.query.refresh || "") === "1");
  res.status(r.ok ? 200 : 502).json(r);
});

// Export the ENTIRE source (all rows, streamed) as CSV. Optional ?q= + ?filters= apply the same filters.
router.get("/bigquery/export.csv", async (req, res) => {
  await streamBigQueryCsv(res, String(req.query.q || "").trim() || undefined, parseFilters(req.query.filters));
});
router.get("/darwinbox/export.csv", async (req, res) => {
  await streamDarwinboxCsv(res, String(req.query.q || "").trim() || undefined, String(req.query.refresh || "") === "1", parseFilters(req.query.filters));
});

// Darwinbox → Instructor Master sync (department-scoped, Employee ID keyed).
// Preview = dry run; apply recomputes the plan server-side and writes it.
router.get("/darwinbox/sync/preview", async (req, res) => {
  const plan = await buildDarwinboxSyncPlan(String(req.query.refresh || "") === "1");
  res.status(plan.ok ? 200 : 502).json(plan);
});

router.post("/darwinbox/sync/apply", async (req, res) => {
  const report = await applyDarwinboxSync(req.user!, true); // always sync from fresh data
  res.status(report.ok ? 200 : 502).json(report);
});

export default router;
