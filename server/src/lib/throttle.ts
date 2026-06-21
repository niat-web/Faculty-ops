// DB-backed login lockout: 5 failures / 15 min (atomic, race-free).
import { LoginAttempt } from "../models";

const MAX = 5;
const WINDOW_MS = 15 * 60 * 1000; // default window/lock duration (overridable per call from Security settings)

export async function isLocked(key: string): Promise<number> {
  const row: any = await LoginAttempt.findOne({ key }).lean();
  if (row?.lockedUntil && new Date(row.lockedUntil) > new Date()) return Math.ceil((new Date(row.lockedUntil).getTime() - Date.now()) / 1000);
  return 0;
}

// Atomic increment + lock decision so concurrent attempts can't race past the limit.
// `max` lets callers set a higher account-wide threshold than the default per-IP one.
// `windowMs` (from Security settings) controls both the rolling window and lock duration.
export async function recordFailure(key: string, max: number = MAX, windowMs: number = WINDOW_MS): Promise<void> {
  const now = new Date();
  // If the window has elapsed since the first failure, start a fresh window.
  const fresh = await LoginAttempt.findOneAndUpdate(
    { key, first: { $lt: new Date(now.getTime() - windowMs) } },
    { $set: { count: 1, first: now, lockedUntil: null, updatedAt: now } },
    { new: true }
  );
  if (fresh) return;
  // Otherwise atomically bump the counter within the current window.
  const row: any = await LoginAttempt.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $set: { updatedAt: now }, $setOnInsert: { first: now } },
    { upsert: true, new: true }
  );
  if (row.count >= max && (!row.lockedUntil || new Date(row.lockedUntil) <= now)) {
    await LoginAttempt.updateOne({ key }, { $set: { lockedUntil: new Date(now.getTime() + windowMs) } });
  }
}

export async function clearFailures(key: string): Promise<void> {
  await LoginAttempt.deleteOne({ key });
}
