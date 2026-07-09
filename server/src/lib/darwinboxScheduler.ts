import { config } from "../config";
import { Role } from "../enums";
import { User } from "../models";
import type { SessionUser } from "./rbac";

// In-process auto-sync: periodically pulls Darwinbox → Instructor Master (MongoDB) so the master
// grid, tabs and dashboard stay near-live without anyone clicking. Complements the manual
// "Sync to Instructor Master" button and the x-cron-secret /api/cron/darwinbox-sync endpoint.
//
// Guards: disabled when interval <= 0 or Darwinbox isn't configured; never overlaps a running sync;
// first run is delayed after boot so startup isn't blocked. The sync itself is idempotent.

let running = false;
let timer: NodeJS.Timeout | null = null;

async function systemActor(): Promise<SessionUser> {
  const ops: any = await User.findOne({ role: Role.OPS_ADMIN, active: true }).select("name email").lean();
  return ops
    ? { id: String(ops._id), name: `${ops.name} (Darwinbox auto-sync)`, email: ops.email, role: Role.OPS_ADMIN, managerId: null }
    : { id: null as any, name: "System (Darwinbox auto-sync)", email: "", role: Role.OPS_ADMIN, managerId: null };
}

// Core Darwinbox → MongoDB sync (idempotent, keyed on Employee ID — no duplicates). Auto-creates any
// missing dynamic fields (ensureMasterFields, inside applyDarwinboxSync). Used by BOTH the hourly tick
// and the manual "Refresh from Darwinbox" path (masterLive). Never overlaps a running sync.
export async function syncDarwinboxIntoMongo(refresh = true): Promise<{ ok: boolean; error?: string }> {
  if (running) return { ok: true }; // a sync is already in-flight — its result will be picked up
  running = true;
  try {
    const { applyDarwinboxSync } = await import("./darwinboxSync");
    const actor = await systemActor();
    const report = await applyDarwinboxSync(actor, refresh);
    if (report.ok) {
      console.log(`[darwinbox-sync] ${report.created} created, ${report.updated} updated (${report.changedFields} fields), ${report.exited} exited, ${report.skipped} skipped`);
      if (report.errors?.length) console.warn(`[darwinbox-sync] ${report.errors.length} error(s):`, report.errors.slice(0, 5));
      // Mirror the FULL directory (every employee + manager) into Mongo for the Org chart, SM picker,
      // CM scoping and Removed enrichment. Reuses the feed just fetched (no extra Darwinbox call).
      try {
        const { syncDarwinboxDirectory } = await import("./staffRoles");
        const d = await syncDarwinboxDirectory();
        if (!d.ok) console.warn(`[darwinbox-directory] skipped: ${d.error}`);
      } catch (e: any) { console.error("[darwinbox-directory] failed:", e?.message || e); }
    } else {
      console.warn(`[darwinbox-sync] skipped: ${report.error}`);
    }
    return { ok: report.ok, error: report.error };
  } catch (e: any) {
    console.error("[darwinbox-sync] failed:", e?.message || e);
    return { ok: false, error: e?.message || "sync failed" };
  } finally {
    running = false;
  }
}

// Full hourly run: sync Mongo from Darwinbox, then the downstream jobs. The BigQuery training
// persist runs regardless of the Darwinbox result — the two sources are independent.
async function runOnce() {
  const r = await syncDarwinboxIntoMongo(true);
  if (r.ok) {
    // After the master is fresh, scan for newly-imminent exits and raise alerts + notify.
    try {
      const { detectExitAlerts } = await import("./exitAlerts");
      const det = await detectExitAlerts();
      if (!det.ok) console.warn(`[exit-alerts] skipped: ${det.error}`);
    } catch (e: any) { console.error("[exit-alerts] failed:", e?.message || e); }
    // Mirror the Darwinbox "Delivery Support" department into pending Ops-Admin user accounts.
    try {
      const { syncOpsAdminUsers } = await import("./staffRoles");
      await syncOpsAdminUsers();
    } catch (e: any) { console.error("[staff-sync] failed:", e?.message || e); }
  }
  // BigQuery → Mongo training persist: keeps the Master's Training % (values.primary_pct) and the
  // fast Training-grid pass accurate from MongoDB alone. Skips cleanly when BigQuery is off.
  try {
    const { persistBigQueryTraining } = await import("./trainingSync");
    const t = await persistBigQueryTraining();
    if (t.ok) console.log(`[training-sync] ${t.matched} matched, ${t.updated} updated (of ${t.scanned})`);
    else console.warn(`[training-sync] skipped: ${t.error}`);
  } catch (e: any) { console.error("[training-sync] failed:", e?.message || e); }
}

const darwinboxConfigured = () => Boolean(config.darwinbox.endpoint && config.darwinbox.username && config.darwinbox.password && config.darwinbox.apiKey && config.darwinbox.datasetKey);

export function startDarwinboxAutoSync() {
  const hours = config.darwinbox.syncIntervalHours;
  if (!hours || hours <= 0) { console.log("[darwinbox-sync] auto-sync disabled (DARWINBOX_SYNC_INTERVAL_HOURS=0)"); return; }
  if (!darwinboxConfigured()) { console.log("[darwinbox-sync] auto-sync off (Darwinbox not configured)"); return; }
  const ms = hours * 60 * 60 * 1000;
  console.log(`[darwinbox-sync] auto-sync enabled — every ${hours}h`);
  // First run ~30s after boot so startup isn't blocked; then on the interval.
  setTimeout(() => { runOnce(); }, 30_000).unref();
  timer = setInterval(() => { runOnce(); }, ms);
  timer.unref(); // don't keep the process alive just for this
}

export function stopDarwinboxAutoSync() {
  if (timer) { clearInterval(timer); timer = null; }
}
