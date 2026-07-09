import { Instructor, TrainingColumn } from "../models";
import { fetchTrainingProgress } from "./bigqueryTraining";
import { recomputeInstructorSummary } from "./training";

// Hourly BigQuery → MongoDB training persist. Pulls the BigQuery learning progress for EVERY
// instructor and writes the matched course statuses into Instructor.moduleStatus, then recomputes
// and persists the summary values (primary_pct, health_status, predicted_completion, …). This is
// what keeps the Instructor Master's Training % column (and the fast Training-grid pass) accurate
// straight from MongoDB — no BigQuery call happens on a Master page load.
//
// Safety rules:
//  - For an instructor that MATCHED at least one BigQuery cell this run, the BigQuery-synced module
//    columns are RECONCILED to the pull: returned cells are set, and a previously-stored synced cell
//    that is NO LONGER in the pull is deleted. This mirrors exactly what the live Training-Stats page
//    computes (routes/training.ts), so the Master's stored % never diverges from the live view for
//    active instructors (fixes the "stale completed module lingers forever" divergence).
//  - An instructor with ZERO matches this run is left untouched (keeps last-known data) — this avoids
//    a transient total BigQuery miss (e.g. a one-run uid mismatch) cratering their % to 0 and flapping.
//  - Manual-only module columns (Frontend/Backend Projects) and non-synced columns are never touched.
//  - Skips entirely (ok:false, no writes) when BigQuery is unconfigured or the pull fails.

const MANUAL_MODULE_KEYS = new Set(["Frontend Projects", "Backend Projects"]);

export type TrainingPersistReport = { ok: boolean; matched: number; updated: number; scanned: number; error?: string };

export async function persistBigQueryTraining(): Promise<TrainingPersistReport> {
  const moduleCols: any[] = await TrainingColumn.find({ archivedAt: null, storage: "module" }).select("track key courseId").lean();
  const live: Record<string, string[]> = {};
  for (const c of moduleCols) (live[c.track] ||= []).push(c.key);
  const syncCols = moduleCols.filter((c) => c.courseId && !MANUAL_MODULE_KEYS.has(c.key));
  if (!syncCols.length) return { ok: true, matched: 0, updated: 0, scanned: 0 }; // nothing is BigQuery-mapped

  // Light pass to build the match keys, then load full docs only for instructors BigQuery matched.
  const keys = await Instructor.find({}).select("employeeId email uid").lean();
  const progress = await fetchTrainingProgress(
    syncCols.map((c) => ({ key: c.key, courseId: c.courseId })),
    (keys as any[]).map((d) => ({ id: String(d._id), employeeId: d.employeeId, email: d.email, uid: d.uid })),
    { fresh: true } // hourly job — always pull fresh, never the 3-min cache
  );
  if (!progress.ok) return { ok: false, matched: 0, updated: 0, scanned: keys.length, error: progress.error };

  let updated = 0;
  const matchedIds = Object.keys(progress.cells || {});
  for (const id of matchedIds) {
    const cells = progress.cells[id];
    if (!cells) continue;
    try {
      const inst: any = await Instructor.findById(id);
      if (!inst) continue;
      let changed = false;
      for (const col of syncCols) {
        const v = cells[col.key];
        if (v) {
          // Fresh BigQuery value → set it.
          if (inst.moduleStatus.get(col.key) !== v) { inst.moduleStatus.set(col.key, v); changed = true; }
        } else if (inst.moduleStatus.get(col.key) != null) {
          // This synced course dropped out of the pull for a matched instructor → remove the stale
          // cell so the recomputed % matches the live Training page (which prunes the same way).
          inst.moduleStatus.delete(col.key); changed = true;
        }
      }
      const sumChanged = await recomputeInstructorSummary(inst, live);
      if (changed || sumChanged) { await inst.save(); updated++; }
    } catch (e: any) {
      console.warn(`[training-sync] instructor ${id}: ${e?.message || e}`);
    }
  }
  return { ok: true, matched: matchedIds.length, updated, scanned: keys.length };
}
