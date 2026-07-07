import { Router } from "express";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { config } from "../config";
import { fetchBigQueryRows } from "../lib/bigqueryTraining";
import { fetchDarwinboxRows } from "../lib/darwinbox";
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
  const page = await fetchBigQueryRows(limit, offset, q || undefined);
  res.status(page.ok ? 200 : 502).json(page);
});

router.get("/darwinbox", async (req, res) => {
  const { limit, offset, q } = paging(req);
  const refresh = String(req.query.refresh || "") === "1";
  const page = await fetchDarwinboxRows(limit, offset, q || undefined, refresh);
  res.status(page.ok ? 200 : 502).json(page);
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
